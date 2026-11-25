package com.vvas.access.ui.resident

import android.Manifest
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.vvas.access.R
import com.vvas.access.data.api.ApiClient
import com.vvas.access.data.model.CreatePassRequest
import com.vvas.access.data.model.VisitorPass
import com.vvas.access.databinding.DialogCreatePassBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.io.File

class CreatePassBottomSheet(
    private val onPassCreated: (VisitorPass) -> Unit
) : BottomSheetDialogFragment() {

    private var _binding: DialogCreatePassBinding? = null
    private val binding get() = _binding!!

    private var selectedDurationHours = 24
    private var pendingCameraUri: Uri? = null

    private val galleryPickerLauncher =
        registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
            if (uri != null) {
                processImageForANPR(uri)
            }
        }

    private val takePictureLauncher =
        registerForActivityResult(ActivityResultContracts.TakePicture()) { success ->
            val uri = pendingCameraUri
            if (success && uri != null) {
                processImageForANPR(uri)
            }
        }

    private val cameraPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                launchCameraCapture()
            } else {
                Toast.makeText(
                    requireContext(),
                    "Camera permission is required to capture vehicle plates.",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = DialogCreatePassBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        setupPurposePresets()
        setupDurationButtons()
        setupAnprButton()
        setupSubmitButton()
    }

    private fun setupPurposePresets() {
        binding.chipPurposeGuest.setOnClickListener { binding.etPurpose.setText("Guest Visit / Meeting") }
        binding.chipPurposeDelivery.setOnClickListener { binding.etPurpose.setText("Grocery & Parcel Delivery") }
        binding.chipPurposeMaintenance.setOnClickListener { binding.etPurpose.setText("Carpentry & Maintenance") }
        binding.chipPurposeCab.setOnClickListener { binding.etPurpose.setText("Cab / Taxi Drop-off") }
    }

    private fun setupDurationButtons() {
        val activeBg = ContextCompat.getColor(requireContext(), R.color.primary_crimson)
        val inactiveBg = ContextCompat.getColor(requireContext(), R.color.bg_input)
        val activeText = ContextCompat.getColor(requireContext(), R.color.white)
        val inactiveText = ContextCompat.getColor(requireContext(), R.color.text_secondary)

        fun updateButtons(active24: Boolean, active48: Boolean, active7d: Boolean) {
            binding.btnDuration24h.backgroundTintList =
                ColorStateList.valueOf(if (active24) activeBg else inactiveBg)
            binding.btnDuration24h.setTextColor(if (active24) activeText else inactiveText)

            binding.btnDuration48h.backgroundTintList =
                ColorStateList.valueOf(if (active48) activeBg else inactiveBg)
            binding.btnDuration48h.setTextColor(if (active48) activeText else inactiveText)

            binding.btnDuration7d.backgroundTintList =
                ColorStateList.valueOf(if (active7d) activeBg else inactiveBg)
            binding.btnDuration7d.setTextColor(if (active7d) activeText else inactiveText)
        }

        binding.btnDuration24h.setOnClickListener {
            selectedDurationHours = 24
            updateButtons(true, false, false)
        }
        binding.btnDuration48h.setOnClickListener {
            selectedDurationHours = 48
            updateButtons(false, true, false)
        }
        binding.btnDuration7d.setOnClickListener {
            selectedDurationHours = 168
            updateButtons(false, false, true)
        }
    }

    private fun setupAnprButton() {
        binding.btnSnapPlateAnpr.setOnClickListener {
            val options = arrayOf("📷 Take Photo with Camera", "🖼️ Choose Photo from Gallery")
            AlertDialog.Builder(requireContext())
                .setTitle("Vehicle Plate Photo for AI Recognition")
                .setItems(options) { _, which ->
                    when (which) {
                        0 -> checkCameraAndLaunch()
                        1 -> galleryPickerLauncher.launch("image/*")
                    }
                }
                .show()
        }
    }

    private fun checkCameraAndLaunch() {
        val ctx = requireContext()
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            launchCameraCapture()
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    private fun launchCameraCapture() {
        val ctx = requireContext()
        val photoFile = File.createTempFile("plate_capture_", ".jpg", ctx.cacheDir)
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", photoFile)
        pendingCameraUri = uri
        takePictureLauncher.launch(uri)
    }

    private fun compressImageToJpeg(uri: Uri): ByteArray {
        val ctx = requireContext()
        val rawBytes = ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return ByteArray(0)
        if (rawBytes.isEmpty()) return ByteArray(0)

        val bitmap = BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.size) ?: return rawBytes
        val maxDim = 1280
        val scaled = if (bitmap.width > maxDim || bitmap.height > maxDim) {
            val ratio = minOf(maxDim.toFloat() / bitmap.width, maxDim.toFloat() / bitmap.height)
            Bitmap.createScaledBitmap(
                bitmap,
                (bitmap.width * ratio).toInt().coerceAtLeast(1),
                (bitmap.height * ratio).toInt().coerceAtLeast(1),
                true
            )
        } else {
            bitmap
        }

        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, 85, out)
        if (scaled != bitmap) scaled.recycle()
        bitmap.recycle()
        return out.toByteArray()
    }

    private fun processImageForANPR(imageUri: Uri) {
        binding.layoutAnprLoading.visibility = View.VISIBLE
        binding.tvAnprSuccessBadge.visibility = View.GONE
        binding.btnSnapPlateAnpr.isEnabled = false

        lifecycleScope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) { compressImageToJpeg(imageUri) }

                if (bytes.isEmpty()) {
                    Toast.makeText(requireContext(), "Failed to read image", Toast.LENGTH_SHORT).show()
                    return@launch
                }

                val requestFile = bytes.toRequestBody("image/jpeg".toMediaTypeOrNull())
                val body = MultipartBody.Part.createFormData("file", "plate_snap.jpg", requestFile)

                val api = ApiClient.getService(requireContext())
                val anprResponse = api.detectPlate(body)

                if (_binding == null) return@launch

                if (anprResponse.success && anprResponse.detectedPlate.isNotBlank()) {
                    val cleanPlate = anprResponse.detectedPlate.uppercase()
                    binding.etVehicleNumber.setText(cleanPlate)

                    val confPercent = (anprResponse.confidence * 100).toInt()
                    binding.tvAnprSuccessBadge.text =
                        "✓ Fast-ALPR Detected: $cleanPlate ($confPercent% Confidence)"
                    binding.tvAnprSuccessBadge.visibility = View.VISIBLE
                    Toast.makeText(requireContext(), "Plate $cleanPlate detected!", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(
                        requireContext(),
                        anprResponse.message.ifBlank { "No plate recognized in image." },
                        Toast.LENGTH_LONG
                    ).show()
                }
            } catch (e: Exception) {
                context?.let {
                    Toast.makeText(it, "ANPR Error: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
                }
            } finally {
                if (_binding != null) {
                    binding.layoutAnprLoading.visibility = View.GONE
                    binding.btnSnapPlateAnpr.isEnabled = true
                }
            }
        }
    }

    private fun setupSubmitButton() {
        binding.btnCancelCreatePass.setOnClickListener { dismiss() }

        binding.btnSubmitCreatePass.setOnClickListener {
            val visitorName = binding.etVisitorName.text.toString().trim()
            val purpose = binding.etPurpose.text.toString().trim()
            val vehicleNumber = binding.etVehicleNumber.text.toString().trim().ifBlank { null }

            if (visitorName.isEmpty()) {
                binding.etVisitorName.error = "Visitor Name is required"
                return@setOnClickListener
            }
            if (purpose.isEmpty()) {
                binding.etPurpose.error = "Purpose of visit is required"
                return@setOnClickListener
            }

            submitPass(visitorName, purpose, vehicleNumber)
        }
    }

    private fun submitPass(visitorName: String, purpose: String, vehicleNumber: String?) {
        binding.btnSubmitCreatePass.isEnabled = false
        binding.btnSubmitCreatePass.text = "Creating Pass..."

        lifecycleScope.launch {
            try {
                val api = ApiClient.getService(requireContext())
                val request = CreatePassRequest(
                    visitorName = visitorName,
                    vehicleNumber = vehicleNumber,
                    purpose = purpose,
                    hoursValid = selectedDurationHours
                )
                val newPass = api.createPass(request)
                context?.let {
                    Toast.makeText(it, "Pass #${newPass.id} created successfully!", Toast.LENGTH_SHORT).show()
                }
                dismiss()
                onPassCreated(newPass)
            } catch (e: Exception) {
                context?.let {
                    Toast.makeText(it, "Failed: ${e.localizedMessage}", Toast.LENGTH_LONG).show()
                }
            } finally {
                if (_binding != null) {
                    binding.btnSubmitCreatePass.isEnabled = true
                    binding.btnSubmitCreatePass.text = "Create & Pre-Register Pass"
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
