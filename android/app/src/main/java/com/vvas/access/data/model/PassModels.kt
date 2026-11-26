package com.vvas.access.data.model

import com.google.gson.annotations.SerializedName

data class VisitorPass(
    val id: Int,
    @SerializedName("visitor_name") val visitorName: String,
    @SerializedName("vehicle_number") val vehicleNumber: String? = null,
    val purpose: String? = null,
    val status: String? = "not_inside", // "not_inside", "in_campus", "exited", "expired"
    @SerializedName("qr_token") val qrToken: String? = "",
    @SerializedName("qr_image_path") val qrImagePath: String? = null,
    @SerializedName("resident_id") val residentId: Int? = null,
    val resident: User? = null,
    @SerializedName("created_at") val createdAt: String? = "",
    @SerializedName("expires_at") val expiresAt: String? = ""
)

data class CreatePassRequest(
    @SerializedName("visitor_name") val visitorName: String,
    @SerializedName("vehicle_number") val vehicleNumber: String?,
    val purpose: String?,
    @SerializedName("hours_valid") val hoursValid: Int = 24
)

data class UpdateQrImageRequest(
    @SerializedName("pass_id") val passId: Int,
    @SerializedName("qr_image_path") val qrImagePath: String
)

data class VerifyQrRequest(
    @SerializedName("qr_token") val qrToken: String,
    val action: String? = null
)

data class ManualEntryRequest(
    @SerializedName("visitor_name") val visitorName: String,
    @SerializedName("vehicle_number") val vehicleNumber: String?,
    val purpose: String? = "Manual Gate Entry",
    val action: String = "entry"
)

data class HardwareApiKey(
    val id: Int,
    val description: String,
    @SerializedName("key_prefix") val keyPrefix: String? = "vvas_hw",
    @SerializedName("is_active") val isActive: Boolean = true,
    @SerializedName("created_at") val createdAt: String? = null
)

data class CreateApiKeyRequest(
    val description: String
)

data class CreateApiKeyResponse(
    val id: Int,
    val description: String,
    @SerializedName("api_key") val apiKey: String,
    val message: String = ""
)

data class CampusStats(
    @SerializedName("vehicles_inside") val vehiclesInside: Int = 0,
    @SerializedName("total_visited") val totalVisited: Int = 0,
    @SerializedName("total_passes") val totalPasses: Int = 0,
    val date: String? = null
)

data class AccessLog(
    val id: Int,
    @SerializedName("visitor_pass_id") val visitorPassId: Int? = null,
    @SerializedName("scanned_by") val scannedBy: Int? = null,
    val action: String = "entry", // "entry", "exit"
    val timestamp: String = "",
    @SerializedName("visitor_pass") val visitorPass: VisitorPass? = null,
    val guard: User? = null
)

data class ANPRDetectResponse(
    val success: Boolean,
    @SerializedName("detected_plate") val detectedPlate: String = "",
    val confidence: Float = 0f,
    @SerializedName("processing_time_ms") val processingTimeMs: Float = 0f,
    @SerializedName("model_name") val modelName: String = "",
    val message: String = "",
    @SerializedName("plate_image_data") val plateImageData: String? = null,
    @SerializedName("pass_found") val passFound: Boolean = false
)

data class QRVerifyResponse(
    val valid: Boolean,
    val message: String = "",
    @SerializedName("visitor_pass") val visitorPass: VisitorPass? = null
)

data class RemoteFrameUploadResponse(
    val success: Boolean = false,
    @SerializedName("frame_id") val frameId: Int = 0,
    val timestamp: String? = null,
    @SerializedName("stream_state") val streamState: String? = null,
    @SerializedName("detected_plate") val detectedPlate: String = "",
    val confidence: Float = 0f,
    @SerializedName("processing_time_ms") val processingTimeMs: Float = 0f,
    @SerializedName("model_name") val modelName: String = "",
    @SerializedName("pass_found") val passFound: Boolean = false,
    @SerializedName("visitor_name") val visitorName: String? = null,
    @SerializedName("flat_number") val flatNumber: String? = null,
    @SerializedName("pass_id") val passId: Int? = null,
    val message: String = ""
)

data class StreamStatusResponse(
    @SerializedName("stream_state") val streamState: String = "disconnected",
    @SerializedName("sender_username") val senderUsername: String? = null,
    @SerializedName("device_info") val deviceInfo: String? = null
)
