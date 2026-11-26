package com.vvas.access.utils

import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.widget.TextView
import com.vvas.access.data.api.SupabaseConfig
import com.vvas.access.data.storage.SessionManager
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Periodically polls the backend health-check endpoint (`GET /`)
 * and updates a status TextView with Active / Offline state.
 */
class BackendStatusMonitor(
    private val statusView: TextView,
    private val intervalMs: Long = 10_000L
) {
    private val handler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private var running = false

    private val pollRunnable = object : Runnable {
        override fun run() {
            if (!running) return
            checkNow()
            handler.postDelayed(this, intervalMs)
        }
    }

    fun start() {
        if (running) return
        running = true
        handler.post(pollRunnable)
    }

    fun stop() {
        running = false
        handler.removeCallbacks(pollRunnable)
    }

    fun checkNow() {
        val baseUrl = SessionManager(statusView.context).serverUrl.trimEnd('/')
        val isSupabase = baseUrl.contains("supabase.co")
        executor.execute {
            val isActive = try {
                val targetUrl = if (isSupabase) "$baseUrl/rest/v1/rpc/vvas_api_get_stats" else "$baseUrl/"
                val conn = (URL(targetUrl).openConnection() as HttpURLConnection).apply {
                    requestMethod = if (isSupabase) "POST" else "GET"
                    connectTimeout = 3000
                    readTimeout = 3000
                    if (isSupabase) {
                        doOutput = true
                        setRequestProperty("apikey", SupabaseConfig.SUPABASE_ANON_KEY)
                        setRequestProperty("Authorization", "Bearer ${SupabaseConfig.SUPABASE_ANON_KEY}")
                        setRequestProperty("Content-Type", "application/json")
                        outputStream.use { it.write("{}".toByteArray()) }
                    }
                }
                val code = conn.responseCode
                conn.disconnect()
                code in 200..299
            } catch (_: Exception) {
                false
            }

            val label = if (isSupabase) "Supabase" else "Backend"
            handler.post {
                if (isActive) {
                    statusView.text = "● $label: Active"
                    statusView.setTextColor(Color.parseColor("#86EFAC"))
                } else {
                    statusView.text = "● $label: Offline"
                    statusView.setTextColor(Color.parseColor("#FCA5A5"))
                }
            }
        }
    }
}
