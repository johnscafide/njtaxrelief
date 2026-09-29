package com.watchdogindex.agent.core.model

enum class PriceCheckKind { LowTaxForPrice, InLine, HighTaxForPrice, Unknown }

data class PriceCheck(
    val kind: PriceCheckKind,
    /** "Low tax for this price" */
    val title: String,
    val body: String,
    /** What homes at this price usually pay in this town. */
    val expectedTax: Int?,
)

sealed interface ScanInput {
    data class ListingUrl(val url: String) : ScanInput
    data class QrCode(val payload: String, val lat: Double?, val lon: Double?) : ScanInput
    data class Address(val query: String) : ScanInput
}

data class ScanResult(
    val property: PropertySummary,
    val score: Int?,
    val verdict: String?,
    val taxBillYear: Int,
    val taxBill: Int?,
    val nextYear: Int,
    val nextYearBill: Int?,
    val listPrice: Int?,
    /** "From the pasted link" / "From the sign's listing link" */
    val priceSourceLabel: String,
    val priceCheck: PriceCheck?,
    /** "For Sale sign · QR read · parcel matched" */
    val matchLabel: String?,
)

data class ScanHistoryItem(val result: ScanResult, val scannedAtEpochSeconds: Long)
