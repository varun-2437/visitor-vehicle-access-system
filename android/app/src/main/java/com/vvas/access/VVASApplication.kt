package com.vvas.access

import android.app.Application
import com.vvas.access.data.storage.SessionManager

class VVASApplication : Application() {
    lateinit var sessionManager: SessionManager
        private set

    override fun onCreate() {
        super.onCreate()
        sessionManager = SessionManager(this)
    }
}
