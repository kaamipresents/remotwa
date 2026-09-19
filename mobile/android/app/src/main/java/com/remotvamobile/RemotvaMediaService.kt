package com.remotvamobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class RemotvaMediaService : Service() {

    companion object {
        const val CHANNEL_ID = "remotva_playback_channel"
        const val NOTIFICATION_ID = 8377
        const val ACTION_START = "com.remotvamobile.ACTION_START"
        const val ACTION_UPDATE = "com.remotvamobile.ACTION_UPDATE"
        const val ACTION_STOP = "com.remotvamobile.ACTION_STOP"
        const val ACTION_PLAY_PAUSE = "com.remotvamobile.ACTION_PLAY_PAUSE"
        const val ACTION_PREV = "com.remotvamobile.ACTION_PREV"
        const val ACTION_NEXT = "com.remotvamobile.ACTION_NEXT"
        const val EXTRA_TITLE = "extra_title"
        const val EXTRA_ARTIST = "extra_artist"
        const val EXTRA_IS_PLAYING = "extra_is_playing"
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: return START_NOT_STICKY

        when (action) {
            ACTION_START -> {
                val title = intent.getStringExtra(EXTRA_TITLE) ?: "Windows Audio Remote"
                val artist = intent.getStringExtra(EXTRA_ARTIST) ?: "Connected to PC"
                val isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, false)
                startForeground(NOTIFICATION_ID, buildNotification(title, artist, isPlaying))
            }
            ACTION_UPDATE -> {
                val title = intent.getStringExtra(EXTRA_TITLE) ?: "Windows Audio Remote"
                val artist = intent.getStringExtra(EXTRA_ARTIST) ?: "Connected to PC"
                val isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, false)
                val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                notificationManager.notify(NOTIFICATION_ID, buildNotification(title, artist, isPlaying))
            }
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
            ACTION_PLAY_PAUSE, ACTION_PREV, ACTION_NEXT -> {
                // Broadcast action to React Native module
                val broadcastIntent = Intent(action)
                sendBroadcast(broadcastIntent)
            }
        }

        return START_STICKY
    }

    private fun buildNotification(title: String, artist: String, isPlaying: Boolean): Notification {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val contentPendingIntent = PendingIntent.getActivity(
            this, 0, openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val playPauseIntent = Intent(this, RemotvaMediaService::class.java).apply {
            action = ACTION_PLAY_PAUSE
        }
        val playPausePending = PendingIntent.getService(
            this, 1, playPauseIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val prevIntent = Intent(this, RemotvaMediaService::class.java).apply {
            action = ACTION_PREV
        }
        val prevPending = PendingIntent.getService(
            this, 2, prevIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val nextIntent = Intent(this, RemotvaMediaService::class.java).apply {
            action = ACTION_NEXT
        }
        val nextPending = PendingIntent.getService(
            this, 3, nextIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val playPauseIcon = if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play
        val playPauseLabel = if (isPlaying) "Pause" else "Play"

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(artist)
            .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
            .setContentIntent(contentPendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(android.R.drawable.ic_media_previous, "Previous", prevPending)
            .addAction(playPauseIcon, playPauseLabel, playPausePending)
            .addAction(android.R.drawable.ic_media_next, "Next", nextPending)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Remotva Media Playback",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows PC media playback and master volume controls"
                setShowBadge(false)
            }
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
}
