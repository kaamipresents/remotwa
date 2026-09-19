package com.remotvamobile

import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class RemotvaMediaModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "RemotvaMediaService"

    @ReactMethod
    fun start(title: String, artist: String, isPlaying: Boolean) {
        val intent = Intent(reactContext, RemotvaMediaService::class.java).apply {
            action = RemotvaMediaService.ACTION_START
            putExtra(RemotvaMediaService.EXTRA_TITLE, title)
            putExtra(RemotvaMediaService.EXTRA_ARTIST, artist)
            putExtra(RemotvaMediaService.EXTRA_IS_PLAYING, isPlaying)
        }
        reactContext.startService(intent)
    }

    @ReactMethod
    fun update(title: String, artist: String, isPlaying: Boolean) {
        val intent = Intent(reactContext, RemotvaMediaService::class.java).apply {
            action = RemotvaMediaService.ACTION_UPDATE
            putExtra(RemotvaMediaService.EXTRA_TITLE, title)
            putExtra(RemotvaMediaService.EXTRA_ARTIST, artist)
            putExtra(RemotvaMediaService.EXTRA_IS_PLAYING, isPlaying)
        }
        reactContext.startService(intent)
    }

    @ReactMethod
    fun stop() {
        val intent = Intent(reactContext, RemotvaMediaService::class.java).apply {
            action = RemotvaMediaService.ACTION_STOP
        }
        reactContext.startService(intent)
    }
}
