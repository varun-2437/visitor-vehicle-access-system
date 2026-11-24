package com.vvas.access.data.api

import com.vvas.access.data.model.*
import okhttp3.MultipartBody
import retrofit2.http.*

interface ApiService {

    // ── Auth ──
    @POST("api/auth/login")
    suspend fun login(
        @Body request: LoginRequest
    ): TokenResponse

    @GET("api/auth/me")
    suspend fun getProfile(): User

    // ── Passes ──
    @GET("api/qr/passes")
    suspend fun getPasses(): List<VisitorPass>

    @POST("api/qr/passes")
    suspend fun createPass(
        @Body request: CreatePassRequest
    ): VisitorPass

    // ── Dashboard Statistics ──
    @GET("api/qr/stats")
    suspend fun getStats(
        @Query("from_date") fromDate: String? = null,
        @Query("to_date") toDate: String? = null
    ): CampusStats

    // ── System Access Logs (Admin & Guard oversight) ──
    @GET("api/qr/logs")
    suspend fun getAccessLogs(): List<AccessLog>

    // ── Fast-ALPR AI Plate Recognition ──
    @Multipart
    @POST("api/anpr/detect-plate")
    suspend fun detectPlate(
        @Part file: MultipartBody.Part
    ): ANPRDetectResponse
}
