package com.vvas.access.data.model

import com.google.gson.annotations.SerializedName

data class VisitorPass(
    val id: Int,
    @SerializedName("visitor_name") val visitorName: String,
    @SerializedName("vehicle_number") val vehicleNumber: String?,
    val purpose: String?,
    val status: String, // "not_inside", "in_campus", "exited", "expired"
    @SerializedName("qr_token") val qrToken: String,
    @SerializedName("qr_image_path") val qrImagePath: String?,
    @SerializedName("resident_id") val residentId: Int?,
    val resident: User?,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("expires_at") val expiresAt: String
)

data class CreatePassRequest(
    @SerializedName("visitor_name") val visitorName: String,
    @SerializedName("vehicle_number") val vehicleNumber: String?,
    val purpose: String?,
    @SerializedName("expires_in_hours") val expiresInHours: Int = 24
)

data class CampusStats(
    @SerializedName("total_inside_today") val totalInsideToday: Int,
    @SerializedName("total_visits_today") val totalVisitsToday: Int,
    @SerializedName("passes_created_today") val passesCreatedToday: Int
)

data class AccessLog(
    val id: Int,
    @SerializedName("visitor_pass_id") val visitorPassId: Int,
    @SerializedName("scanned_by") val scannedBy: Int?,
    val action: String, // "entry", "exit"
    val timestamp: String,
    @SerializedName("visitor_pass") val visitorPass: VisitorPass?
)

data class ANPRDetectResponse(
    val success: Boolean,
    @SerializedName("detected_plate") val detectedPlate: String,
    val confidence: Float,
    @SerializedName("processing_time_ms") val processingTimeMs: Float,
    @SerializedName("model_name") val modelName: String,
    val message: String,
    @SerializedName("plate_image_data") val plateImageData: String?,
    @SerializedName("pass_found") val passFound: Boolean
)
