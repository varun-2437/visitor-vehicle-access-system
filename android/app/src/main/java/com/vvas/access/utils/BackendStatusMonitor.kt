package com.vvas.access.utils

import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.widget.TextView
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
        executor.execute {
            val isActive = try {
                val conn = (URL("$baseUrl/").openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 3000
                    readTimeout = 3000
                }
                val code = conn.responseCode
                conn.disconnect()
                code in 200..299
            } catch (_: Exception) {
                false
            }

            handler.post {
                if (isActive) {
                    statusView.text = "● Backend: Active"
                    statusView.setTextColor(Color.parseColor("#86EFAC"))
                } else {
                    statusView.text = "● Backend: Offline"
                    statusView.setTextColor(Color.parseColor("#FCA5A5"))
                }
            }
        }
    }
}
