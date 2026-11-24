package com.vvas.access.data.model

import com.google.gson.annotations.SerializedName

data class User(
    val id: Int,
    val username: String,
    val email: String?,
    @SerializedName("full_name") val fullName: String,
    val role: String, // "resident", "guard", "admin"
    @SerializedName("flat_number") val flatNumber: String?,
    @SerializedName("is_approved") val isApproved: Boolean?
)

data class LoginRequest(
    val username: String,
    val password: String
)

data class TokenResponse(
    @SerializedName("access_token") val accessToken: String,
    @SerializedName("token_type") val tokenType: String
)
