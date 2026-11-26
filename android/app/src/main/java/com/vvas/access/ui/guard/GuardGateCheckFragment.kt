package com.vvas.access.ui.guard

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.google.zxing.BinaryBitmap
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.vvas.access.data.api.ApiClient
import com.vvas.access.data.model.ManualEntryRequest
import com.vvas.access.data.model.VerifyQrRequest
import com.vvas.access.databinding.FragmentGuardGateCheckBinding
import kotlinx.coroutines.launch
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class GuardGateCheckFragment : Fragment() {

    private var _binding: FragmentGuardGateCheckBinding? = null
    private val binding get() = _binding!!

    private val cameraExecutor = Executors.newSingleThreadExecutor()
    private var cameraProvider: ProcessCameraProvider? = null
    private var scannerActive = false
    private val isProcessingQr = AtomicBoolean(false)
    private val qrReader = MultiFormatReader()

    private val cameraPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) startQrScanner()
            else Toast.makeText(requireContext(), "Camera permission denied", Toast.LENGTH_SHORT).show()
        }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentGuardGateCheckBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnToggleQrScanner.setOnClickListener {
            if (scannerActive) {
                stopQrScanner()
            } else {
                if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.CAMERA) ==
                    PackageManager.PERMISSION_GRANTED
                ) {
                    startQrScanner()
                } else {
                    cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                }
            }
        }

        binding.btnVerifyQrEntry.setOnClickListener { submitQrVerify("entry") }
        binding.btnVerifyQrExit.setOnClickListener { submitQrVerify("exit") }
        binding.btnSubmitManualEntry.setOnClickListener { submitManualEntry() }
    }

    private fun startQrScanner() {
        scannerActive = true
        isProcessingQr.set(false)
        binding.qrPreviewView.visibility = View.VISIBLE
        binding.btnToggleQrScanner.text = "Stop Camera Scanner"

        val future = ProcessCameraProvider.getInstance(requireContext())
        future.addListener({
            val provider = future.get()
            cameraProvider = provider
            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(binding.qrPreviewView.surfaceProvider)
            }
            val analysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()

            analysis.setAnalyzer(cameraExecutor) { image ->
                if (isProcessingQr.get()) {
                    image.close()
                    return@setAnalyzer
                }
                try {
                    val yPlane = image.planes[0]
                    val buffer = yPlane.buffer
                    val bytes = ByteArray(buffer.remaining())
                    buffer.get(bytes)
                    val source = PlanarYUVLuminanceSource(
                        bytes, image.width, image.height, 0, 0, image.width, image.height, false
                    )
                    val bitmap = BinaryBitmap(HybridBinarizer(source))
                    val result = qrReader.decode(bitmap)
                    val token = result.text?.trim().orEmpty()
                    if (token.isNotEmpty() && isProcessingQr.compareAndSet(false, true)) {
                        activity?.runOnUiThread {
                            binding.etQrToken.setText(token)
                            stopQrScanner()
                            submitQrVerify(null)
                        }
                    }
                } catch (_: Exception) {
                    // No QR code in frame
                } finally {
                    image.close()
                }
            }

            try {
                provider.unbindAll()
                provider.bindToLifecycle(viewLifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "Camera error: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
            }
        }, ContextCompat.getMainExecutor(requireContext()))
    }

    private fun stopQrScanner() {
        scannerActive = false
        cameraProvider?.unbindAll()
        if (_binding != null) {
            binding.qrPreviewView.visibility = View.GONE
            binding.btnToggleQrScanner.text = "Start Camera QR Scanner"
        }
    }

    private fun submitQrVerify(action: String?) {
        val token = binding.etQrToken.text.toString().trim()
        if (token.isEmpty()) {
            binding.etQrToken.error = "Enter or scan a QR token"
            return
        }
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val res = ApiClient.getService(requireContext()).verifyQr(VerifyQrRequest(token, action))
                showResult(res.valid, res.message)
                if (res.valid) binding.etQrToken.setText("")
            } catch (e: Exception) {
                showResult(false, e.localizedMessage ?: "Verification failed")
            }
        }
    }

    private fun submitManualEntry() {
        val plate = binding.etManualVehicle.text.toString().trim().uppercase()
        val visitor = binding.etManualVisitor.text.toString().trim()
        val purpose = binding.etManualPurpose.text.toString().trim().ifBlank { "Manual Gate Entry" }

        if (plate.isEmpty() || visitor.isEmpty()) {
            Toast.makeText(requireContext(), "Enter both vehicle plate and visitor name", Toast.LENGTH_SHORT).show()
            return
        }
        binding.btnSubmitManualEntry.isEnabled = false
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val res = ApiClient.getService(requireContext())
                    .manualEntry(ManualEntryRequest(visitor, plate, purpose, "entry"))
                showResult(res.valid, res.message)
                if (res.valid) {
                    binding.etManualVehicle.setText("")
                    binding.etManualVisitor.setText("")
                    binding.etManualPurpose.setText("")
                }
            } catch (e: Exception) {
                showResult(false, e.localizedMessage ?: "Manual entry failed")
            } finally {
                if (_binding != null) binding.btnSubmitManualEntry.isEnabled = true
            }
        }
    }

    private fun showResult(valid: Boolean, message: String) {
        if (_binding == null) return
        binding.cardGateResult.visibility = View.VISIBLE
        if (valid) {
            binding.layoutGateResult.setBackgroundColor(Color.parseColor("#DCFCE7"))
            binding.tvGateResultTitle.setTextColor(Color.parseColor("#166534"))
            binding.tvGateResultMessage.setTextColor(Color.parseColor("#14532D"))
            binding.tvGateResultTitle.text = "GATE ACTION APPROVED"
        } else {
            binding.layoutGateResult.setBackgroundColor(Color.parseColor("#FEE2E2"))
            binding.tvGateResultTitle.setTextColor(Color.parseColor("#991B1B"))
            binding.tvGateResultMessage.setTextColor(Color.parseColor("#7F1D1D"))
            binding.tvGateResultTitle.text = "VERIFICATION FAILED"
        }
        binding.tvGateResultMessage.text = message
    }

    override fun onDestroyView() {
        stopQrScanner()
        cameraExecutor.shutdown()
        super.onDestroyView()
        _binding = null
    }
}
