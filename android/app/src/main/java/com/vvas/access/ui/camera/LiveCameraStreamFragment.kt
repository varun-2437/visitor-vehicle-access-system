package com.vvas.access.ui.camera

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.vvas.access.R
import com.vvas.access.data.api.ApiClient
import com.vvas.access.data.storage.SessionManager
import com.vvas.access.databinding.FragmentLiveCameraStreamBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class LiveCameraStreamFragment : Fragment() {

    enum class StreamState {
        DISCONNECTED,
        CONNECTING,
        CONNECTED,
        STREAMING,
        PAUSED,
        RECONNECTING
    }

    private var _binding: FragmentLiveCameraStreamBinding? = null
    private val binding get() = _binding!!

    private lateinit var cameraExecutor: ExecutorService
    private var cameraProvider: ProcessCameraProvider? = null
    private var lensFacing = CameraSelector.LENS_FACING_BACK

    private var currentState = StreamState.DISCONNECTED
    private var isStreamingActive = false
    private var isUploadingFrame = AtomicBoolean(false)
    private var snapRequested = AtomicBoolean(false)
    private var lastFrameSentMillis = 0L
    private var framesSentCount = 0

    private val cameraPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                startCameraAndConnect()
            } else {
                setUiState(StreamState.DISCONNECTED, "Camera permission denied")
                Toast.makeText(
                    requireContext(),
                    "Camera permission is required for live ANPR streaming.",
                    Toast.LENGTH_LONG
                ).show()
            }
        }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentLiveCameraStreamBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        cameraExecutor = Executors.newSingleThreadExecutor()

        setupControls()
        checkCameraPermission()
    }

    private fun setupControls() {
        binding.btnToggleStream.setOnClickListener {
            if (isStreamingActive) {
                pauseLiveStream()
            } else {
                startLiveStream()
            }
        }

        binding.btnSnapOnce.setOnClickListener {
            if (currentState == StreamState.DISCONNECTED) {
                checkCameraPermission()
            }
            snapRequested.set(true)
            Toast.makeText(requireContext(), "Capturing frame for ANPR...", Toast.LENGTH_SHORT).show()
        }

        binding.btnStopStream.setOnClickListener {
            stopAndDisconnect()
        }

        binding.btnFlipCamera.setOnClickListener {
            lensFacing = if (lensFacing == CameraSelector.LENS_FACING_BACK) {
                CameraSelector.LENS_FACING_FRONT
            } else {
                CameraSelector.LENS_FACING_BACK
            }
            bindCameraUseCases()
        }
    }

    private fun checkCameraPermission() {
        val ctx = requireContext()
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            startCameraAndConnect()
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    private fun startCameraAndConnect() {
        setUiState(StreamState.CONNECTING, "Initializing camera & linking to server...")
        val cameraProviderFuture = ProcessCameraProvider.getInstance(requireContext())
        cameraProviderFuture.addListener({
            if (_binding == null) return@addListener
            cameraProvider = cameraProviderFuture.get()
            bindCameraUseCases()
            notifyServerState("connected")
        }, ContextCompat.getMainExecutor(requireContext()))
    }

    private fun bindCameraUseCases() {
        val provider = cameraProvider ?: return
        val preview = Preview.Builder().build().also {
            it.setSurfaceProvider(binding.cameraPreviewView.surfaceProvider)
        }

        val imageAnalyzer = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
            .also { analysis ->
                analysis.setAnalyzer(cameraExecutor) { imageProxy ->
                    processCameraFrame(imageProxy)
                }
            }

        val selector = CameraSelector.Builder()
            .requireLensFacing(lensFacing)
            .build()

        try {
            provider.unbindAll()
            provider.bindToLifecycle(viewLifecycleOwner, selector, preview, imageAnalyzer)
        } catch (e: Exception) {
            setUiState(StreamState.RECONNECTING, "Camera bind failed: ${e.localizedMessage}")
        }
    }

    private fun startLiveStream() {
        if (cameraProvider == null) {
            checkCameraPermission()
        }
        isStreamingActive = true
        binding.btnToggleStream.text = "⏸ Pause"
        binding.btnToggleStream.setBackgroundColor(Color.parseColor("#D97706"))
        setUiState(StreamState.STREAMING, "Streaming live frames (~8 FPS) to Web ANPR Terminal")
        notifyServerState("streaming")
    }

    private fun pauseLiveStream() {
        isStreamingActive = false
        binding.btnToggleStream.text = "▶ Resume"
        binding.btnToggleStream.setBackgroundColor(
            ContextCompat.getColor(requireContext(), R.color.primary_crimson)
        )
        setUiState(StreamState.PAUSED, "Feed paused • Tap Resume to stream")
        notifyServerState("paused")
    }

    private fun stopAndDisconnect() {
        isStreamingActive = false
        binding.btnToggleStream.text = "▶ Start Live"
        binding.btnToggleStream.setBackgroundColor(
            ContextCompat.getColor(requireContext(), R.color.primary_crimson)
        )
        setUiState(StreamState.DISCONNECTED, "Disconnected from Web ANPR page")
        notifyServerState("disconnected")
    }

    private fun processCameraFrame(imageProxy: ImageProxy) {
        val isManualSnap = snapRequested.getAndSet(false)
        val now = System.currentTimeMillis()
        // Stream at ~8 FPS (120ms) for smooth live video without stalling on AI
        val dueForStreamFrame = isStreamingActive && (now - lastFrameSentMillis >= 120L)

        if (!isManualSnap && !dueForStreamFrame) {
            imageProxy.close()
            return
        }

        if (!isUploadingFrame.compareAndSet(false, true)) {
            imageProxy.close()
            return
        }

        lastFrameSentMillis = now
        val runAnprNow = isManualSnap && !isStreamingActive
        val targetWidth = if (runAnprNow) 960 else 640
        val jpegQuality = if (runAnprNow) 80 else 60

        val jpegBytes = try {
            val rawBitmap = imageProxy.toBitmap()
            val rotated = rotateBitmapIfNeeded(rawBitmap, imageProxy.imageInfo.rotationDegrees)
            if (rotated != rawBitmap) rawBitmap.recycle()

            val scaled = if (rotated.width > targetWidth) {
                val ratio = targetWidth.toFloat() / rotated.width
                Bitmap.createScaledBitmap(
                    rotated,
                    targetWidth,
                    (rotated.height * ratio).toInt().coerceAtLeast(1),
                    true
                )
            } else {
                rotated
            }
            if (scaled != rotated) rotated.recycle()

            ByteArrayOutputStream().use { out ->
                scaled.compress(Bitmap.CompressFormat.JPEG, jpegQuality, out)
                scaled.recycle()
                out.toByteArray()
            }
        } catch (e: Exception) {
            ByteArray(0)
        } finally {
            imageProxy.close()
        }

        if (jpegBytes.isEmpty()) {
            isUploadingFrame.set(false)
            return
        }

        val mode = if (runAnprNow) "snapshot" else "live_stream"
        uploadFrameBytes(jpegBytes, mode, runAnprNow)
    }

    private fun rotateBitmapIfNeeded(bitmap: Bitmap, rotationDegrees: Int): Bitmap {
        if (rotationDegrees == 0) return bitmap
        val matrix = Matrix().apply { postRotate(rotationDegrees.toFloat()) }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    private fun uploadFrameBytes(jpegBytes: ByteArray, streamMode: String, runAnprNow: Boolean) {
        val ctx = context ?: run {
            isUploadingFrame.set(false)
            return
        }
        val deviceName = "${Build.MANUFACTURER} ${Build.MODEL}"

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val api = ApiClient.getService(ctx)
                val fileBody = jpegBytes.toRequestBody("image/jpeg".toMediaTypeOrNull())
                val filePart = MultipartBody.Part.createFormData("file", "live_frame.jpg", fileBody)
                val deviceBody = deviceName.toRequestBody("text/plain".toMediaTypeOrNull())
                val modeBody = streamMode.toRequestBody("text/plain".toMediaTypeOrNull())
                val anprBody = runAnprNow.toString().toRequestBody("text/plain".toMediaTypeOrNull())

                val res = withContext(Dispatchers.IO) {
                    api.uploadRemoteFrame(filePart, deviceBody, modeBody, anprBody)
                }

                if (_binding == null) return@launch

                framesSentCount++
                val latency = res.processingTimeMs.toInt()
                binding.tvFrameStats.text = if (isStreamingActive) {
                    "🔴 LIVE • Frame #$framesSentCount"
                } else {
                    "📸 Snap #$framesSentCount (${latency}ms)"
                }

                if (isStreamingActive) {
                    setUiState(StreamState.STREAMING, "Streaming live as @${SessionManager(ctx).currentUser?.username ?: "cam"}")
                } else if (currentState == StreamState.CONNECTING || currentState == StreamState.RECONNECTING) {
                    setUiState(StreamState.CONNECTED, "Snapshot sent • Ready")
                }

                if (res.detectedPlate.isNotBlank()) {
                    binding.layoutLivePlateOverlay.visibility = View.VISIBLE
                    val conf = (res.confidence * 100).toInt()
                    binding.tvDetectedPlateOverlay.text = "${res.detectedPlate} • $conf%"
                    binding.tvDetectedPlateSub.text = if (res.passFound) {
                        "✓ Pass #VP-%05d (%s)".format(res.passId ?: 0, res.visitorName ?: "Visitor")
                    } else {
                        "Valid plate sent to Web ANPR Terminal"
                    }
                } else if (runAnprNow) {
                    binding.layoutLivePlateOverlay.visibility = View.GONE
                }
            } catch (e: Exception) {
                if (_binding != null) {
                    setUiState(StreamState.RECONNECTING, "Reconnecting: ${e.localizedMessage ?: "Network error"}")
                }
            } finally {
                isUploadingFrame.set(false)
            }
        }
    }

    private fun notifyServerState(stateStr: String) {
        val ctx = context ?: return
        val deviceName = "${Build.MANUFACTURER} ${Build.MODEL}"
        val mode = if (stateStr == "streaming") "live_stream" else "snapshot"

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    ApiClient.getService(ctx).updateStreamStatus(stateStr, deviceName, mode)
                }
                if (_binding != null && stateStr == "connected") {
                    val user = SessionManager(ctx).currentUser?.username ?: "gatecam"
                    setUiState(StreamState.CONNECTED, "Connected (@$user) • Ready to stream")
                }
            } catch (e: Exception) {
                if (_binding != null && stateStr != "disconnected") {
                    setUiState(StreamState.RECONNECTING, "Server unreachable (${e.localizedMessage ?: "offline"})")
                }
            }
        }
    }

    private fun setUiState(state: StreamState, detail: String) {
        if (_binding == null) return
        currentState = state
        binding.tvStreamSubInfo.text = detail

        val (label, bgHex, fgHex, dotHex) = when (state) {
            StreamState.STREAMING -> Quad("STREAMING", "#DCFCE7", "#166534", "#16A34A")
            StreamState.CONNECTED -> Quad("CONNECTED", "#DBEAFE", "#1E40AF", "#2563EB")
            StreamState.CONNECTING -> Quad("CONNECTING", "#FEF3C7", "#92400E", "#D97706")
            StreamState.PAUSED -> Quad("PAUSED", "#FEF3C7", "#92400E", "#D97706")
            StreamState.RECONNECTING -> Quad("RECONNECTING", "#FFEDD5", "#9A3412", "#EA580C")
            StreamState.DISCONNECTED -> Quad("DISCONNECTED", "#F1F5F9", "#475569", "#94A3B8")
        }

        binding.tvStreamStatusPill.text = label
        binding.tvStreamStatusPill.setTextColor(Color.parseColor(fgHex))

        val pillBg = GradientDrawable().apply {
            cornerRadius = 100f
            setColor(Color.parseColor(bgHex))
        }
        binding.layoutStatusPill.background = pillBg

        val dotBg = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(Color.parseColor(dotHex))
        }
        binding.viewStatusDot.background = dotBg
    }

    private data class Quad(val label: String, val bg: String, val fg: String, val dot: String)

    override fun onDestroyView() {
        val appCtx = context?.applicationContext
        val deviceName = "${Build.MANUFACTURER} ${Build.MODEL}"
        if (appCtx != null) {
            kotlinx.coroutines.CoroutineScope(Dispatchers.IO).launch {
                runCatching {
                    ApiClient.getService(appCtx).updateStreamStatus("disconnected", deviceName, "live_stream")
                }
            }
        }
        cameraExecutor.shutdown()
        super.onDestroyView()
        _binding = null
    }
}
