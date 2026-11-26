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

                val isSupabase = baseUrl.contains("supabase.co")
                if (isSupabase) {
                    requestBuilder.header("apikey", SupabaseConfig.SUPABASE_ANON_KEY)
                    requestBuilder.header("Authorization", "Bearer ${SupabaseConfig.SUPABASE_ANON_KEY}")
                } else {
                    sessionManager.authToken?.let { token ->
                        requestBuilder.header("Authorization", "Bearer $token")
                    }
                }
                requestBuilder.header("Accept", "application/json")
                requestBuilder.header("User-Agent", "VVAS-Android-Client/2.0")

                if (isSupabase) {
                    val path = original.url.encodedPath
                    val jsonMediaType = "application/json; charset=utf-8".toMediaType()
                    val tokenUserId = sessionManager.authToken
                        ?.removePrefix("supabase-user-")
                        ?.removePrefix("supabase-direct-")
                        ?.toIntOrNull()
                    val currentUserId = tokenUserId ?: sessionManager.currentUser?.id ?: 1
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
                        path.endsWith("/api/auth/me") -> {
                            "vvas_me" to JSONObject().apply {
                                put("p_user_id", currentUserId)
                            }
                        }
                        path.endsWith("/api/qr/my-passes") || path.endsWith("/api/qr/today-passes") -> {
                            "vvas_api_get_passes" to JSONObject().apply {
                                put("p_user_id", currentUserId)
                                put("p_role", currentRole)
                                put("p_all_time", true)
                            }
                        }
                        path.endsWith("/api/qr/generate") -> {
                            val src = readBodyJson()
                            "vvas_api_create_pass" to JSONObject().apply {
                                put("p_visitor_name", src.optString("visitor_name"))
                                put("p_vehicle_number", src.optString("vehicle_number"))
                                put("p_purpose", src.optString("purpose", ""))
                                put("p_resident_id", currentUserId)
                                put("p_hours_valid", src.optInt("hours_valid", 24))
                            }
                        }
                        path.endsWith("/api/qr/save-qr") -> {
                            val src = readBodyJson()
                            "vvas_update_pass_qr" to JSONObject().apply {
                                put("p_pass_id", src.optInt("pass_id"))
                                put("p_qr_image_path", src.optString("qr_image_path"))
                            }
                        }
                        path.contains("/api/qr/passes/") && path.endsWith("/mark-exit") -> {
                            val passId = path.split("/").dropLast(1).lastOrNull()?.toIntOrNull() ?: 0
                            "vvas_mark_exit" to JSONObject().apply {
                                put("p_pass_id", passId)
                                put("p_scanned_by", currentUserId)
                            }
                        }
                        path.endsWith("/api/qr/verify") -> {
                            val src = readBodyJson()
                            "vvas_verify_qr" to JSONObject().apply {
                                put("p_qr_token", src.optString("qr_token"))
                                if (src.has("action") && !src.isNull("action")) {
                                    put("p_action", src.optString("action"))
                                }
                                put("p_scanned_by", currentUserId)
                            }
                        }
                        path.endsWith("/api/qr/manual-entry") -> {
                            val src = readBodyJson()
                            "vvas_api_manual_entry" to JSONObject().apply {
                                put("p_visitor_name", src.optString("visitor_name"))
                                put("p_vehicle_number", src.optString("vehicle_number"))
                                put("p_purpose", src.optString("purpose", "Manual Gate Entry"))
                                put("p_action", src.optString("action", "entry"))
                                put("p_scanned_by", currentUserId)
                            }
                        }
                        path.endsWith("/api/auth/register") -> {
                            val src = readBodyJson()
                            "vvas_signup" to JSONObject().apply {
                                put("p_username", src.optString("username"))
                                put("p_email", src.optString("email"))
                                put("p_password", src.optString("password"))
                                put("p_full_name", src.optString("full_name"))
                                put("p_role", src.optString("role", "resident"))
                                put("p_flat_number", src.optString("flat_number", ""))
                                put("p_auto_approve", true)
                            }
                        }
                        path.endsWith("/api/admin/users") -> {
                            "vvas_admin_users" to JSONObject()
                        }
                        path.contains("/api/admin/users/") && path.endsWith("/approve") -> {
                            val uid = path.split("/").dropLast(1).lastOrNull()?.toIntOrNull() ?: 0
                            "vvas_approve_user" to JSONObject().apply { put("p_user_id", uid) }
                        }
                        path.contains("/api/admin/users/") && path.endsWith("/reject") -> {
                            val uid = path.split("/").dropLast(1).lastOrNull()?.toIntOrNull() ?: 0
                            val src = readBodyJson()
                            "vvas_reject_user" to JSONObject().apply {
                                put("p_user_id", uid)
                                put("p_reason", src.optString("rejection_reason", "Rejected by Admin"))
                            }
                        }
                        path.matches(Regex(".*/api/admin/users/\\d+$")) && original.method.equals("DELETE", true) -> {
                            val uid = path.split("/").lastOrNull()?.toIntOrNull() ?: 0
                            "vvas_delete_user" to JSONObject().apply { put("p_user_id", uid) }
                        }
                        path.endsWith("/api/admin/api-keys") && original.method.equals("GET", true) -> {
                            "vvas_admin_api_keys" to JSONObject()
                        }
                        path.endsWith("/api/admin/api-keys") && original.method.equals("POST", true) -> {
                            val src = readBodyJson()
                            "vvas_create_api_key" to JSONObject().apply {
                                put("p_description", src.optString("description", "Hardware Key"))
                                put("p_created_by", currentUserId)
                            }
                        }
                        path.matches(Regex(".*/api/admin/api-keys/\\d+$")) && original.method.equals("DELETE", true) -> {
                            val kid = path.split("/").lastOrNull()?.toIntOrNull() ?: 0
                            "vvas_delete_api_key" to JSONObject().apply { put("p_key_id", kid) }
                        }
                        path.endsWith("/api/qr/stats") -> {
                            "vvas_api_get_stats" to JSONObject()
                        }
                        path.endsWith("/api/admin/logs") || path.endsWith("/api/qr/today-logs") -> {
                            "vvas_api_get_logs" to JSONObject().apply {
                                put("p_all_time", true)
                            }
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
