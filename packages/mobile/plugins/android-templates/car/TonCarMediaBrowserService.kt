package com.ton.player.car

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Process
import android.support.v4.media.MediaBrowserCompat
import androidx.media.MediaBrowserServiceCompat
import com.doublesymmetry.trackplayer.service.MusicService
import java.util.concurrent.Executors

class TonCarMediaBrowserService : MediaBrowserServiceCompat() {
    private val catalogExecutor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private lateinit var catalog: TonCarCatalogRepository
    private var musicService: MusicService? = null
    private var isBoundToMusicService = false
    private var tokenAttempts = 0

    private val musicConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            musicService = (binder as? MusicService.MusicBinder)?.service
            tokenAttempts = 0
            publishSessionTokenWhenReady()
        }

        override fun onServiceDisconnected(name: ComponentName) {
            musicService = null
            isBoundToMusicService = false
            stopSelf()
        }
    }

    override fun onCreate() {
        super.onCreate()
        catalog = TonCarCatalogRepository(applicationContext)
        bindToMusicService()
    }

    override fun onGetRoot(
        clientPackageName: String,
        clientUid: Int,
        rootHints: android.os.Bundle?,
    ): BrowserRoot? {
        if (!isAllowedClient(clientPackageName, clientUid)) return null
        return BrowserRoot(TonCarMediaIds.ROOT, null)
    }

    override fun onLoadChildren(
        parentId: String,
        result: Result<List<MediaBrowserCompat.MediaItem>>,
    ) {
        result.detach()
        catalogExecutor.execute {
            val children = try {
                catalog.loadChildren(parentId)
            } catch (_: Exception) {
                emptyList()
            }
            mainHandler.post { result.sendResult(children) }
        }
    }

    override fun onDestroy() {
        mainHandler.removeCallbacksAndMessages(null)
        catalogExecutor.shutdownNow()
        if (isBoundToMusicService) unbindService(musicConnection)
        isBoundToMusicService = false
        musicService = null
        super.onDestroy()
    }

    private fun bindToMusicService() {
        if (isBoundToMusicService) return
        val intent = Intent().apply {
            component = ComponentName(
                packageName,
                "com.doublesymmetry.trackplayer.service.MusicService",
            )
            action = MusicService.CAR_BROWSER_BIND_ACTION
        }
        isBoundToMusicService = bindService(intent, musicConnection, Context.BIND_AUTO_CREATE)
    }

    private fun publishSessionTokenWhenReady() {
        val token = musicService?.getMediaSessionToken()
        if (token != null) {
            sessionToken = token
            return
        }
        if (tokenAttempts++ >= MAX_TOKEN_ATTEMPTS) return
        mainHandler.postDelayed(::publishSessionTokenWhenReady, TOKEN_RETRY_MS)
    }

    private fun isAllowedClient(clientPackageName: String, clientUid: Int): Boolean {
        if (clientUid == Process.SYSTEM_UID || clientPackageName == packageName) return true
        val uidPackages = packageManager.getPackagesForUid(clientUid)?.toSet().orEmpty()
        return clientPackageName in uidPackages && clientPackageName in ALLOWED_CAR_PACKAGES
    }

    companion object {
        private const val TOKEN_RETRY_MS = 150L
        private const val MAX_TOKEN_ATTEMPTS = 200
        private val ALLOWED_CAR_PACKAGES = setOf(
            "com.google.android.projection.gearhead",
            "com.google.android.apps.automotive.inputmethod",
        )
    }
}
