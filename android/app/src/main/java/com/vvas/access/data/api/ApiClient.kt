package com.vvas.access.data.api

import android.content.Context
import com.vvas.access.data.storage.SessionManager
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import okio.Buffer
import org.json.JSONObject
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object ApiClient {
    private var apiService: ApiService? = null
    private var currentBaseUrl: String? = null

    fun getService(context: Context): ApiService {
        val sessionManager = SessionManager(context)
        val baseUrl = sessionManager.serverUrl

        if (apiService == null || currentBaseUrl != baseUrl) {
            currentBaseUrl = baseUrl

            val authInterceptor = Interceptor { chain ->
                val original = chain.request()
                val requestBuilder = original.newBuilder()

                if (baseUrl.contains("supabase.co")) {
                    requestBuilder.addHeader("apikey", SupabaseConfig.SUPABASE_ANON_KEY)
                    requestBuilder.addHeader("Authorization", "Bearer ${SupabaseConfig.SUPABASE_ANON_KEY}")
                    requestBuilder.addHeader("Content-Type", "application/json")
                } else {
                    sessionManager.authToken?.let { token ->
                        requestBuilder.addHeader("Authorization", "Bearer $token")
                    }
                }
                requestBuilder.addHeader("Accept", "application/json")
                requestBuilder.addHeader("User-Agent", "VVAS-Android-Client/2.0")

                if (baseUrl.contains("supabase.co")) {
                    val path = original.url.encodedPath
                    val jsonMediaType = "application/json; charset=utf-8".toMediaType()
                    val currentUserId = sessionManager.currentUser?.id ?: 1
                    val currentRole = sessionManager.userRole ?: "resident"

                    fun readBodyJson(): JSONObject {
                        val body = original.body ?: return JSONObject()
                        val buffer = Buffer()
                        body.writeTo(buffer)
                        val str = buffer.readUtf8()
                        return if (str.isNotBlank()) JSONObject(str) else JSONObject()
                    }

                    val (rpcName, rpcPayload) = when {
                        path.endsWith("/api/auth/login") -> {
                            val src = readBodyJson()
                            "vvas_login" to JSONObject().apply {
                                put("p_username", src.optString("username"))
                                put("p_password", src.optString("password"))
                            }
                        }
                        path.endsWith("/api/qr/my-passes") || path.endsWith("/api/qr/today-passes") -> {
                            "vvas_get_passes" to JSONObject().apply {
                                put("p_user_id", currentUserId)
                                put("p_role", currentRole)
                            }
                        }
                        path.endsWith("/api/qr/generate") -> {
                            val src = readBodyJson()
                            "vvas_create_pass" to JSONObject().apply {
                                put("p_visitor_name", src.optString("visitor_name"))
                                put("p_vehicle_number", src.optString("vehicle_number"))
                                put("p_purpose", src.optString("purpose", ""))
                                put("p_resident_id", currentUserId)
                                put("p_duration_hours", src.optInt("duration_hours", 24))
                            }
                        }
                        path.contains("/api/qr/passes/") && path.endsWith("/mark-exit") -> {
                            val passId = path.split("/").dropLast(1).lastOrNull()?.toIntOrNull() ?: 0
                            "vvas_mark_exit" to JSONObject().apply {
                                put("p_pass_id", passId)
                                put("p_scanned_by", currentUserId)
                            }
                        }
                        path.endsWith("/api/qr/stats") -> {
                            "vvas_get_stats" to JSONObject()
                        }
                        path.endsWith("/api/admin/logs") || path.endsWith("/api/qr/today-logs") -> {
                            "vvas_get_logs" to JSONObject()
                        }
                        else -> null to null
                    }

                    if (rpcName != null && rpcPayload != null) {
                        val newUrl = original.url.newBuilder()
                            .encodedPath("/rest/v1/rpc/$rpcName")
                            .query(null)
                            .build()
                        requestBuilder.url(newUrl)
                        requestBuilder.post(rpcPayload.toString().toRequestBody(jsonMediaType))
                    }
                }

                chain.proceed(requestBuilder.build())
            }

            val loggingInterceptor = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            }

            val okHttpClient = OkHttpClient.Builder()
                .addInterceptor(authInterceptor)
                .addInterceptor(loggingInterceptor)
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(20, TimeUnit.SECONDS)
                .writeTimeout(20, TimeUnit.SECONDS)
                .build()

            val retrofit = Retrofit.Builder()
                .baseUrl(baseUrl)
                .client(okHttpClient)
                .addConverterFactory(GsonConverterFactory.create())
                .build()

            apiService = retrofit.create(ApiService::class.java)
        }

        return apiService!!
    }

    fun resetClient() {
        apiService = null
        currentBaseUrl = null
    }
}
