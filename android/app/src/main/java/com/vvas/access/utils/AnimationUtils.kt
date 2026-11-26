package com.vvas.access.utils

import android.animation.ObjectAnimator
import android.view.MotionEvent
import android.view.View
import android.view.animation.DecelerateInterpolator

object AnimationUtils {

    /**
     * Smooth open-up entrance animation (fade in + subtle upward slide).
     */
    fun animateEntrance(view: View, delayMs: Long = 0L, durationMs: Long = 380L) {
        view.alpha = 0f
        view.translationY = 28f
        view.animate()
            .alpha(1f)
            .translationY(0f)
            .setStartDelay(delayMs)
            .setDuration(durationMs)
            .setInterpolator(DecelerateInterpolator())
            .start()
    }

    /**
     * Subtle horizontal shake for invalid input or login errors.
     */
    fun shakeView(view: View) {
        ObjectAnimator.ofFloat(view, "translationX", 0f, -14f, 14f, -10f, 10f, -5f, 5f, 0f).apply {
            duration = 380L
            start()
        }
    }

    /**
     * Micro-animation: gentle scale-down on press and spring-back on release.
     */
    @Suppress("ClickableViewAccessibility")
    fun addPressScale(view: View, scale: Float = 0.96f) {
        view.setOnTouchListener { v, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    v.animate().scaleX(scale).scaleY(scale).setDuration(90L).start()
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    v.animate().scaleX(1f).scaleY(1f).setDuration(120L).start()
                }
            }
            false
        }
    }
}
