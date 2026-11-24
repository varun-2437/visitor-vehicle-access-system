package com.vvas.access.ui.resident

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.vvas.access.R
import com.vvas.access.data.api.ApiClient
import com.vvas.access.data.model.CreatePassRequest
import com.vvas.access.data.model.VisitorPass
import com.vvas.access.databinding.DialogCreatePassBinding
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.InputStream

class CreatePassBottomSheet(
    private val onPassCreated: (VisitorPass) -> Unit
) : BottomSheetDialogFragment() {

    private var _binding: DialogCreatePassBinding? = null
    private val binding get() = _binding!!

    private var selectedDurationHours = 24

    // Photo picker launcher for vehicle plate image
    private val imagePickerLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == Activity.RESULT_OK && result.data != null) {
                val imageUri: Uri? = result.data?.data
                if (imageUri != null) {
                    processImageForANPR(imageUri)
                }
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
        val activeText = ContextCompat.getColor(requireContext(), R.color.white)
        val inactiveText = ContextCompat.getColor(requireContext(), R.color.text_secondary)

        fun updateButtons(active24: Boolean, active48: Boolean, active7d: Boolean) {
            binding.btnDuration24h.setBackgroundColor(if (active24) activeBg else android.graphics.Color.TRANSPARENT)
            binding.btnDuration24h.setTextColor(if (active24) activeText else inactiveText)

            binding.btnDuration48h.setBackgroundColor(if (active48) activeBg else android.graphics.Color.TRANSPARENT)
            binding.btnDuration48h.setTextColor(if (active48) activeText else inactiveText)

            binding.btnDuration7d.setBackgroundColor(if (active7d) activeBg else android.graphics.Color.TRANSPARENT)
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
            val intent = Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI)
            intent.type = "image/*"
            imagePickerLauncher.launch(intent)
        }
    }

    private fun processImageForANPR(imageUri: Uri) {
        binding.layoutAnprLoading.visibility = View.VISIBLE
        binding.tvAnprSuccessBadge.visibility = View.GONE
        binding.btnSnapPlateAnpr.isEnabled = false

        lifecycleScope.launch {
            try {
                val inputStream: InputStream? = requireContext().contentResolver.openInputStream(imageUri)
                val bytes = inputStream?.readBytes() ?: ByteArray(0)
                inputStream?.close()

                if (bytes.isEmpty()) {
                    Toast.makeText(requireContext(), "Failed to read image", Toast.LENGTH_SHORT).show()
                    return@launch
                }

                val requestFile = bytes.toRequestBody("image/jpeg".toMediaTypeOrNull())
                val body = MultipartBody.Part.createFormData("file", "plate_snap.jpg", requestFile)

                val api = ApiClient.getService(requireContext())
                val anprResponse = api.detectPlate(body)

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
                Toast.makeText(requireContext(), "ANPR Error: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.layoutAnprLoading.visibility = View.GONE
                binding.btnSnapPlateAnpr.isEnabled = true
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
                    expiresInHours = selectedDurationHours
                )
                val newPass = api.createPass(request)
                Toast.makeText(requireContext(), "Pass #${newPass.id} created successfully!", Toast.LENGTH_SHORT).show()
                dismiss()
                onPassCreated(newPass)
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "Failed: ${e.localizedMessage}", Toast.LENGTH_LONG).show()
            } finally {
                binding.btnSubmitCreatePass.isEnabled = true
                binding.btnSubmitCreatePass.text = "Create & Pre-Register Pass"
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
