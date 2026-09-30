package com.watchdogindex.agent.core.repo.live

import com.watchdogindex.agent.core.WatchdogException
import com.watchdogindex.agent.core.api.LiveKeys
import com.watchdogindex.agent.core.api.ListingLinks
import com.watchdogindex.agent.core.api.PropertyApi
import com.watchdogindex.agent.core.api.StoredScan
import com.watchdogindex.agent.core.api.StoredScanHistory
import com.watchdogindex.agent.core.api.readJson
import com.watchdogindex.agent.core.api.writeJson
import com.watchdogindex.agent.core.model.ScanHistoryItem
import com.watchdogindex.agent.core.model.ScanInput
import com.watchdogindex.agent.core.model.ScanResult
import com.watchdogindex.agent.core.repo.ScanRepository
import kotlinx.coroutines.CancellationException

/**
 * Scan: a pasted listing link, a sign's QR code or a typed address becomes a parcel through the property route's
 * `?pin=` or `?address=&lat=&lon=` modes (the extension's request shapes, `extension/background.js:11-16`). The
 * list price is never read from a link, so the result asks for it; the price check runs once the agent adds it.
 * History is kept on the device (last 25, one per parcel).
 *
 * Every result says whether the home is already one of the agent's saved homes ([ScanResult.isSaved], from
 * [properties]): one `saved_properties` lookup here instead of a whole property detail round-trip in the screen.
 * A lookup that fails only means the bookmark starts unsaved (saving is idempotent), never that the scan is lost.
 */
class LiveScanRepository(private val ctx: LiveContext, private val properties: LivePropertyRepository = LivePropertyRepository(ctx)) : ScanRepository {

    override suspend fun resolve(input: ScanInput): ScanResult {
        val resolved = when (input) {
            is ScanInput.ListingUrl -> resolvePayload(ListingLinks.parsePayload(input.url), lat = null, lon = null, fromSign = false)
            is ScanInput.QrCode -> resolvePayload(ListingLinks.parsePayload(input.payload), input.lat, input.lon, fromSign = true)
            is ScanInput.Address -> {
                val q = input.query.trim()
                if (q.isEmpty()) throw WatchdogException("Empty address", userMessage = "Type an address to look up.")
                val response = lookup { ctx.property.byAddress(q) }
                ctx.mapper.scanResult(response, null, "Add the list price", if (response.confident) "Address matched to a parcel" else "Closest match · check the address")
            }
        }
        val result = resolved.copy(isSaved = savedOrFalse(resolved.property.pin))
        remember(result)
        return result
    }

    private suspend fun savedOrFalse(pin: String): Boolean = try {
        properties.isSaved(pin)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        false
    }

    private suspend fun resolvePayload(payload: ListingLinks.Payload, lat: Double?, lon: Double?, fromSign: Boolean): ScanResult = when (payload) {
        is ListingLinks.Payload.Pin -> {
            val response = lookup { ctx.property.byPin(payload.pin) }
            ctx.mapper.scanResult(response, null, "Add the list price", if (fromSign) "For Sale sign · QR read · parcel matched" else "Watchdog link · parcel matched")
        }
        is ListingLinks.Payload.Listing -> {
            val response = lookup { ctx.property.byAddress(payload.listing.address, lat, lon) }
            val label = when {
                !response.confident -> "Closest match · check the address"
                fromSign -> "For Sale sign · listing link · parcel matched"
                else -> "${payload.listing.site.name} listing · parcel matched"
            }
            ctx.mapper.scanResult(response, null, if (fromSign) "From the sign’s listing link" else "From the pasted link", label)
        }
        is ListingLinks.Payload.Address -> {
            val response = lookup { ctx.property.byAddress(payload.text, lat, lon) }
            ctx.mapper.scanResult(response, null, "Add the list price", if (response.confident) "Address matched to a parcel" else "Closest match · check the address")
        }
        is ListingLinks.Payload.NotAProperty -> throw WatchdogException("Not a property: ${payload.url}", userMessage = "That code opens ${payload.reason}, not a property. Open it in your browser instead.")
        ListingLinks.Payload.Unrecognized -> throw WatchdogException("Unrecognized payload", userMessage = "Paste a Zillow, Realtor.com or Redfin listing link, a Watchdog property link, or type the address.")
    }

    /** Turns the route's "not found" into a sentence that names the near misses, so the agent can retype the right one. */
    private suspend fun lookup(block: suspend () -> PropertyApi.Response): PropertyApi.Response {
        try {
            return block()
        } catch (e: PropertyApi.NotFoundException) {
            val alternatives = e.alternatives.take(3).mapNotNull { a -> a.address?.let { "${it}${a.town?.let { t -> ", $t" } ?: ""}" } }
            if (alternatives.isEmpty()) throw WatchdogException("Not found", e, e.userMessage)
            throw WatchdogException("Not found", e, "${e.userMessage.trimEnd('.')}. Did you mean ${alternatives.joinToString("; ")}?")
        }
    }

    private suspend fun remember(result: ScanResult) {
        val stored = ctx.store.readJson<StoredScanHistory>(LiveKeys.SCAN_HISTORY) ?: StoredScanHistory()
        val item = ScanHistoryItem(result, ctx.now().epochSeconds)
        val next = listOf(StoredScan.from(item)) + stored.items.filter { it.pin != result.property.pin }
        ctx.store.writeJson(LiveKeys.SCAN_HISTORY, StoredScanHistory(next.take(MAX_HISTORY)))
    }

    /** The stored scans, newest first, each with its saved flag refreshed in one request; the stored flag stands when that fails. */
    override suspend fun history(): List<ScanHistoryItem> {
        val items = (ctx.store.readJson<StoredScanHistory>(LiveKeys.SCAN_HISTORY) ?: StoredScanHistory()).items.map { it.toModel() }
        if (items.isEmpty()) return items
        val saved = try {
            properties.savedPins(items.map { it.result.property.pin })
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return items
        }
        return items.map { item -> item.copy(result = item.result.copy(isSaved = item.result.property.pin in saved)) }
    }

    companion object {
        const val MAX_HISTORY = 25
    }
}
