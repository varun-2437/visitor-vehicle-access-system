package com.vvas.access.ui.resident

import android.app.Dialog
import android.content.Context
import android.os.Bundle
import android.view.Window
import androidx.core.content.ContextCompat
import com.vvas.access.R
import com.vvas.access.data.model.VisitorPass
import com.vvas.access.databinding.DialogPassDetailBinding
import com.vvas.access.utils.DateTimeUtils
import com.vvas.access.utils.QRCodeGenerator

class PassDetailDialog(
    context: Context,
    private val pass: VisitorPass
) : Dialog(context) {

    private lateinit var binding: DialogPassDetailBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        binding = DialogPassDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        window?.setBackgroundDrawableResource(android.R.color.transparent)

        binding.tvDialogPassId.text = DateTimeUtils.formatPassId(pass.id)
        binding.tvDialogVisitor.text = "Visitor: ${pass.visitorName}"
        binding.tvDialogVehicle.text = "Vehicle: ${pass.vehicleNumber?.uppercase() ?: "Walk-in / None"}"
        binding.tvDialogPurpose.text = "Purpose: ${pass.purpose ?: "General Visit"}"
        binding.tvDialogExpires.text = "Valid Until: ${DateTimeUtils.formatDateTime(pass.expiresAt)}"

        // Generate QR Code bitmap from pass QR Token
        val qrBitmap = QRCodeGenerator.generateQRCode(pass.qrToken, 600)
        if (qrBitmap != null) {
            binding.ivQrCode.setImageBitmap(qrBitmap)
        }

        // Status badge
        when (pass.status.lowercase()) {
            "in_campus", "used" -> {
                binding.tvDialogStatus.text = "● IN CAMPUS"
                binding.tvDialogStatus.setBackgroundResource(R.drawable.bg_status_in_campus)
                binding.tvDialogStatus.setTextColor(ContextCompat.getColor(context, R.color.status_in_campus))
            }
            "not_inside", "approved", "pending" -> {
                binding.tvDialogStatus.text = "⏳ NOT INSIDE"
                binding.tvDialogStatus.setBackgroundResource(R.drawable.bg_status_not_inside)
                binding.tvDialogStatus.setTextColor(ContextCompat.getColor(context, R.color.status_not_inside))
            }
            "exited" -> {
                binding.tvDialogStatus.text = "✓ EXITED"
                binding.tvDialogStatus.setBackgroundResource(R.drawable.bg_status_exited)
                binding.tvDialogStatus.setTextColor(ContextCompat.getColor(context, R.color.status_exited))
            }
            else -> {
                binding.tvDialogStatus.text = "⚠️ EXPIRED"
                binding.tvDialogStatus.setBackgroundResource(R.drawable.bg_status_expired)
                binding.tvDialogStatus.setTextColor(ContextCompat.getColor(context, R.color.status_expired))
            }
        }

        binding.btnCloseDialog.setOnClickListener { dismiss() }
    }
}
