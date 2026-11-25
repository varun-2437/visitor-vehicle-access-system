package com.vvas.access.ui.resident

import android.app.Dialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.vvas.access.R
import com.vvas.access.data.api.ApiClient
import com.vvas.access.data.model.VisitorPass
import com.vvas.access.data.storage.SessionManager
import com.vvas.access.databinding.DialogPassDetailBinding
import com.vvas.access.utils.DateTimeUtils
import com.vvas.access.utils.QRCodeGenerator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class PassDetailDialog(
    context: Context,
    private val pass: VisitorPass,
    private val onExitMarked: (() -> Unit)? = null
) : Dialog(context) {

    private lateinit var binding: DialogPassDetailBinding
    private val dialogScope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        binding = DialogPassDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        window?.setBackgroundDrawableResource(android.R.color.transparent)

        binding.tvDialogPassId.text = "PASS REF: ${DateTimeUtils.formatPassId(pass.id)}"
        binding.tvDialogVisitor.text = pass.visitorName

        val plate = pass.vehicleNumber?.trim()?.uppercase()
        if (!plate.isNullOrEmpty()) {
            binding.tvDialogVehicle.text = plate
            binding.tvDialogVehicle.setBackgroundResource(R.drawable.bg_pass_plate_yellow)
            binding.tvDialogVehicle.setTextColor(Color.BLACK)
        } else {
            binding.tvDialogVehicle.text = "Walk-in / No Vehicle"
            binding.tvDialogVehicle.background = null
            binding.tvDialogVehicle.setTextColor(Color.parseColor("#64748B"))
        }

        binding.tvDialogHostName.text = pass.resident?.fullName
            ?: pass.resident?.username?.let { "@$it" }
            ?: "Host Resident"
        binding.tvDialogHostFlat.text = pass.resident?.flatNumber?.takeIf { it.isNotBlank() }
            ?: "Campus Gate / Front Office"
        binding.tvDialogPurpose.text = pass.purpose?.takeIf { it.isNotBlank() }
            ?: "General Visitor Access"

        binding.tvDialogIssued.text = DateTimeUtils.formatDateTime(pass.createdAt)
        binding.tvDialogExpires.text = DateTimeUtils.formatDateTime(pass.expiresAt)

        val token = pass.qrToken.orEmpty()
        binding.tvDialogToken.text = if (token.isNotBlank()) "TOKEN: $token" else "TOKEN: —"
        if (token.isNotBlank()) {
            val qrBitmap = QRCodeGenerator.generateQRCode(token, 600)
            if (qrBitmap != null) {
                binding.ivQrCode.setImageBitmap(qrBitmap)
            }
        }

        val normalizedStatus = pass.status?.lowercase() ?: "not_inside"
        when (normalizedStatus) {
            "in_campus", "used" -> {
                binding.tvDialogStatus.text = "ACTIVE PASS — VEHICLE INSIDE CAMPUS"
                binding.tvDialogStatus.setBackgroundResource(R.drawable.bg_status_in_campus)
                binding.tvDialogStatus.setTextColor(ContextCompat.getColor(context, R.color.status_in_campus))
            }
            "not_inside", "approved", "pending" -> {
                binding.tvDialogStatus.text = "PRE-APPROVED (AWAITING ENTRY)"
                binding.tvDialogStatus.setBackgroundResource(R.drawable.bg_status_not_inside)
                binding.tvDialogStatus.setTextColor(ContextCompat.getColor(context, R.color.status_not_inside))
            }
            "exited" -> {
                binding.tvDialogStatus.text = "VISIT COMPLETED (VEHICLE EXITED)"
                binding.tvDialogStatus.setBackgroundResource(R.drawable.bg_status_exited)
                binding.tvDialogStatus.setTextColor(ContextCompat.getColor(context, R.color.status_exited))
            }
            else -> {
                binding.tvDialogStatus.text = "PASS EXPIRED (INVALID FOR ENTRY)"
                binding.tvDialogStatus.setBackgroundResource(R.drawable.bg_status_expired)
                binding.tvDialogStatus.setTextColor(ContextCompat.getColor(context, R.color.status_expired))
            }
        }

        // Only Admin (with callback) can mark an in-campus vehicle as exited from the dialog
        val isAdmin = SessionManager(context).userRole == "admin"
        val isInside = normalizedStatus == "in_campus" || normalizedStatus == "used"
        if (isAdmin && isInside && onExitMarked != null) {
            binding.btnMarkExitDialog.visibility = View.VISIBLE
            binding.btnMarkExitDialog.setOnClickListener {
                performMarkExit()
            }
        } else {
            binding.btnMarkExitDialog.visibility = View.GONE
        }

        binding.btnCopyToken.setOnClickListener {
            if (token.isNotBlank()) {
                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("VVAS Pass Token", token))
                binding.btnCopyToken.text = "✓ Copied"
                Toast.makeText(context, "Pass token copied", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnTopClose.setOnClickListener { dismiss() }
        binding.btnCloseDialog.setOnClickListener { dismiss() }
    }

    private fun performMarkExit() {
        binding.btnMarkExitDialog.isEnabled = false
        binding.btnMarkExitDialog.text = "Marking Exit..."

        dialogScope.launch {
            try {
                val res = ApiClient.getService(context).markPassExit(pass.id)
                if (res.valid) {
                    Toast.makeText(context, res.message.ifBlank { "Vehicle marked as exited!" }, Toast.LENGTH_SHORT).show()
                    onExitMarked?.invoke()
                    dismiss()
                } else {
                    Toast.makeText(context, res.message.ifBlank { "Could not mark exit" }, Toast.LENGTH_LONG).show()
                    binding.btnMarkExitDialog.isEnabled = true
                    binding.btnMarkExitDialog.text = "🚗 Mark Vehicle as Exited"
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Error: ${e.localizedMessage}", Toast.LENGTH_LONG).show()
                binding.btnMarkExitDialog.isEnabled = true
                binding.btnMarkExitDialog.text = "🚗 Mark Vehicle as Exited"
            }
        }
    }

    override fun onStart() {
        super.onStart()
        val width = (context.resources.displayMetrics.widthPixels * 0.94).toInt()
        window?.setLayout(width, ViewGroup.LayoutParams.WRAP_CONTENT)
    }

    override fun onStop() {
        super.onStop()
        dialogScope.cancel()
    }
}
