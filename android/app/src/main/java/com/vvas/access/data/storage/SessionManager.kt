package com.vvas.access.data.storage

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.vvas.access.data.model.User

class SessionManager(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val gson = Gson()

    companion object {
        private const val PREFS_NAME = "vvas_session_prefs"
        private const val KEY_SERVER_URL = "key_server_url"
        private const val KEY_AUTH_TOKEN = "key_auth_token"
        private const val KEY_USER_DATA = "key_user_data"
        const val DEFAULT_SERVER_URL = "https://vvas-api-production.up.railway.app/"
    }

    var serverUrl: String
        get() {
            var url = prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL) ?: DEFAULT_SERVER_URL
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                url = "http://$url"
            }
            if (!url.endsWith("/")) {
                url = "$url/"
            }
            return url
        }
        set(value) {
            var formatted = value.trim()
            if (!formatted.startsWith("http://") && !formatted.startsWith("https://")) {
                formatted = "http://$formatted"
            }
            if (!formatted.endsWith("/")) {
                formatted = "$formatted/"
            }
            prefs.edit().putString(KEY_SERVER_URL, formatted).apply()
        }

    var authToken: String?
        get() = prefs.getString(KEY_AUTH_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_AUTH_TOKEN, value).apply()

    var currentUser: User?
        get() {
            val json = prefs.getString(KEY_USER_DATA, null) ?: return null
            return try {
                gson.fromJson(json, User::class.java)
            } catch (e: Exception) {
                null
            }
        }
        set(value) {
            val json = if (value != null) gson.toJson(value) else null
            prefs.edit().putString(KEY_USER_DATA, json).apply()
        }

    val isLoggedIn: Boolean
        get() = !authToken.isNullOrBlank() && currentUser != null

    val userRole: String
        get() = currentUser?.role?.lowercase() ?: ""

    fun clearSession() {
        prefs.edit()
            .remove(KEY_AUTH_TOKEN)
            .remove(KEY_USER_DATA)
            .apply()
    }
}
