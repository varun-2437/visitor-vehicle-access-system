package com.vvas.access.data.api

import android.content.Context
import com.vvas.access.data.storage.SessionManager
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
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

                sessionManager.authToken?.let { token ->
                    requestBuilder.addHeader("Authorization", "Bearer $token")
                }
                requestBuilder.addHeader("Accept", "application/json")
                requestBuilder.addHeader("User-Agent", "VVAS-Android-Client/2.0")

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
