package com.vvas.access.data.api

import com.vvas.access.data.model.*
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.*

interface ApiService {

    // ── Auth ──
    @POST("api/auth/login")
    suspend fun login(
        @Body request: LoginRequest
    ): TokenResponse

    @GET("api/auth/me")
    suspend fun getProfile(): User

    // ── Passes (Resident & Admin) ──
    @GET("api/qr/my-passes")
    suspend fun getMyPasses(): List<VisitorPass>

    @GET("api/qr/today-passes")
    suspend fun getTodayPasses(
        @Query("from_date") fromDate: String? = null,
        @Query("to_date") toDate: String? = null,
        @Query("all_time") allTime: Boolean? = null
    ): List<VisitorPass>

    @POST("api/qr/generate")
    suspend fun createPass(
        @Body request: CreatePassRequest
    ): VisitorPass

    @POST("api/qr/save-qr")
    suspend fun saveQrImage(
        @Body request: UpdateQrImageRequest
    ): okhttp3.ResponseBody

    @POST("api/qr/passes/{pass_id}/mark-exit")
    suspend fun markPassExit(
        @Path("pass_id") passId: Int
    ): QRVerifyResponse

    @POST("api/qr/verify")
    suspend fun verifyQr(
        @Body request: VerifyQrRequest
    ): QRVerifyResponse

    @POST("api/qr/manual-entry")
    suspend fun manualEntry(
        @Body request: ManualEntryRequest
    ): QRVerifyResponse

    // ── Admin User & Key Management ──
    @GET("api/admin/users")
    suspend fun getAdminUsers(): List<User>

    @POST("api/auth/register")
    suspend fun createAdminUser(
        @Body request: RegisterRequest
    ): okhttp3.ResponseBody

    @PUT("api/admin/users/{user_id}/approve")
    suspend fun approveUser(
        @Path("user_id") userId: Int
    ): User

    @PUT("api/admin/users/{user_id}/reject")
    suspend fun rejectUser(
        @Path("user_id") userId: Int,
        @Body request: RejectUserRequest
    ): User

    @DELETE("api/admin/users/{user_id}")
    suspend fun deleteUser(
        @Path("user_id") userId: Int
    ): okhttp3.ResponseBody

    @GET("api/admin/api-keys")
    suspend fun getApiKeys(): List<HardwareApiKey>

    @POST("api/admin/api-keys")
    suspend fun createApiKey(
        @Body request: CreateApiKeyRequest
    ): CreateApiKeyResponse

    @DELETE("api/admin/api-keys/{key_id}")
    suspend fun revokeApiKey(
        @Path("key_id") keyId: Int
    ): okhttp3.ResponseBody

    // ── Dashboard Statistics ──
    @GET("api/qr/stats")
    suspend fun getStats(
        @Query("from_date") fromDate: String? = null,
        @Query("to_date") toDate: String? = null
    ): CampusStats

    // ── System Access Logs (Admin & Guard oversight) ──
    @GET("api/admin/logs")
    suspend fun getAdminLogs(): List<AccessLog>

    @GET("api/qr/today-logs")
    suspend fun getTodayLogs(
        @Query("from_date") fromDate: String? = null,
        @Query("to_date") toDate: String? = null,
        @Query("all_time") allTime: Boolean? = null
    ): List<AccessLog>

    // ── Fast-ALPR AI Plate Recognition & Live Phone Stream ──
    @Multipart
    @POST("api/anpr/detect-plate")
    suspend fun detectPlate(
        @Part file: MultipartBody.Part
    ): ANPRDetectResponse

    @Multipart
    @POST("api/anpr/remote-frame")
    suspend fun uploadRemoteFrame(
        @Part file: MultipartBody.Part,
        @Part("device_info") deviceInfo: RequestBody,
        @Part("stream_mode") streamMode: RequestBody,
        @Part("run_anpr") runAnpr: RequestBody
    ): RemoteFrameUploadResponse

    @FormUrlEncoded
    @POST("api/anpr/stream-status")
    suspend fun updateStreamStatus(
        @Field("state") state: String,
        @Field("device_info") deviceInfo: String,
        @Field("stream_mode") streamMode: String = "live_stream"
    ): StreamStatusResponse
}
