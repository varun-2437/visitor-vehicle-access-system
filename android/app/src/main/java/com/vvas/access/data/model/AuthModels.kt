package com.vvas.access.data.model

import com.google.gson.annotations.SerializedName

data class User(
    val id: Int,
    val username: String,
    val email: String?,
    @SerializedName("full_name") val fullName: String,
    val role: String, // "resident", "guard", "admin", "camera"
    @SerializedName("flat_number") val flatNumber: String?,
    @SerializedName("is_approved") val isApproved: Boolean?,
    @SerializedName("approval_status") val approvalStatus: String? = null,
    @SerializedName("rejection_reason") val rejectionReason: String? = null,
    @SerializedName("created_at") val createdAt: String? = null
)

data class LoginRequest(
    val username: String,
    val password: String
)

data class RegisterRequest(
    val username: String,
    val email: String,
    val password: String,
    @SerializedName("full_name") val fullName: String,
    val role: String = "resident",
    @SerializedName("flat_number") val flatNumber: String? = null
)

data class RejectUserRequest(
    @SerializedName("rejection_reason") val rejectionReason: String
)

data class ChangePasswordRequest(
    @SerializedName("current_password") val currentPassword: String,
    @SerializedName("new_password") val newPassword: String
)

data class TokenResponse(
    @SerializedName("access_token") val accessToken: String,
    @SerializedName("token_type") val tokenType: String
)
