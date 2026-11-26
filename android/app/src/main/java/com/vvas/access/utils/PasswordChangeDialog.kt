package com.vvas.access.utils

import android.app.AlertDialog
import android.content.Context
import android.text.InputType
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.lifecycle.LifecycleCoroutineScope
import com.vvas.access.data.api.ApiClient
import com.vvas.access.data.model.ChangePasswordRequest
import kotlinx.coroutines.launch

/**
 * Shared dialog allowing any logged-in user (Admin, Guard, Resident, GateCam)
 * to update their Supabase account password.
 */
object PasswordChangeDialog {
    fun show(context: Context, scope: LifecycleCoroutineScope) {
        val pad = (16 * context.resources.displayMetrics.density).toInt()
        val layout = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad / 2, pad, pad / 2)
        }
        val pwdType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        val etCurrent = EditText(context).apply {
            hint = "Current Password *"
            inputType = pwdType
        }
        val etNew = EditText(context).apply {
            hint = "New Password (min 6 chars) *"
            inputType = pwdType
        }
        val etConfirm = EditText(context).apply {
            hint = "Confirm New Password *"
            inputType = pwdType
        }
        layout.addView(etCurrent)
        layout.addView(etNew)
        layout.addView(etConfirm)

        AlertDialog.Builder(context)
            .setTitle("Change Account Password")
            .setView(layout)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Update") { _, _ ->
                val current = etCurrent.text.toString()
                val next = etNew.text.toString()
                val confirm = etConfirm.text.toString()
                if (current.isEmpty() || next.length < 6) {
                    Toast.makeText(context, "New password must be at least 6 characters", Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                if (next != confirm) {
                    Toast.makeText(context, "New passwords do not match", Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                scope.launch {
                    runCatching {
                        ApiClient.getService(context).changePassword(ChangePasswordRequest(current, next))
                    }.onSuccess {
                        Toast.makeText(context, "Password updated successfully!", Toast.LENGTH_SHORT).show()
                    }.onFailure { err ->
                        Toast.makeText(context, "Failed: ${err.localizedMessage}", Toast.LENGTH_LONG).show()
                    }
                }
            }
            .show()
    }
}
