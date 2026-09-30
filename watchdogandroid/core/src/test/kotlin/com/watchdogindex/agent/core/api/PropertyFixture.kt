package com.watchdogindex.agent.core.api

/** The section 7.3 example, made concrete: 102 Grant Ave, Harrison Town (PIN 0904_9_20), numbers that agree with each other. */
object PropertyFixture {
    const val PIN = "0904_9_20"

    val json: String = """
{
  "ok": true,
  "property": {
    "pams_pin": "0904_9_20", "address": "102 GRANT AVE", "town": "HARRISON TOWN", "county": "HUDSON",
    "block": "9", "lot": "20", "qualifier": null, "prop_class": "2",
    "year_built": 1900, "acres": 0.0574, "dwelling_units": 2, "building_desc": "2 SF 2 FAM",
    "land_value": 180000, "improvement_value": 244300, "assessed_value": 424300, "last_year_tax": 9954.08,
    "last_sale_price": null, "last_sale_date": null, "last_sale_year": null,
    "source_synced_at": "2026-09-28T15:15:28Z",
    "lat": 40.7449, "lon": -74.1563,
    "score": { "score": 78, "verdict": "Favorable tax position", "confidence": "high", "evidence_coverage": 85,
               "model_version": "ROBUST-v1", "computed_at": "2026-09-27T00:00:00Z", "source": "robust_public_cache",
               "components": { "recourse": 60, "fairness": { "score": 100 }, "burden": 86, "uniformity": 69, "stability": null, "trajectory": 45 } },
    "town_compare": { "peers": 1964, "median_tax": 10828, "median_assessed": null, "share_paying_less": 39, "refreshed_at": "2026-09-01T00:00:00Z" },
    "neighbors": [ { "pams_pin": "0904_9_1", "address": "140 GRANT AVE", "town": "HARRISON TOWN", "assessed_value": null, "last_year_tax": 10655.53 } ],
    "recent_sales": [
      { "pams_pin": "0904_12_3", "address": "88 GRANT AVE", "town": "HARRISON TOWN", "price": 585000, "date": "2026-06-12", "year_built": 1905, "assessed_value": 401200, "same_street": true },
      { "pams_pin": "0904_15_8", "address": "17 SUSSEX ST", "town": "HARRISON TOWN", "price": 612000, "date": "2026-03-03", "year_built": 1920, "assessed_value": 455000, "same_street": false },
      { "pams_pin": "0904_21_2", "address": "5 CLEVELAND AVE", "town": "HARRISON TOWN", "price": 559000, "date": "2026-01-14", "year_built": 1910, "assessed_value": 398700, "same_street": false }
    ],
    "sales_summary": { "count": 3, "median": 585000, "first_date": "2026-01-14", "last_date": "2026-06-12" },
    "alerts_enabled": false
  },
  "photo_url": null,
  "derived": {
    "display": { "address": "102 Grant Ave", "town": "Harrison Town", "county": "Hudson", "class_label": "Residential", "property_path": "/nj/harrison-town/102-grant-ave/0904_9_20" },
    "bill": { "year": 2024, "label": "2024 tax bill", "current": { "year": 2025, "amount": 10115.32, "general_rate_only": false } },
    "rate_trend": { "points": [ { "year": 2020, "rate": 2.161 }, { "year": 2021, "rate": 2.198 }, { "year": 2022, "rate": 2.245 }, { "year": 2023, "rate": 2.301 }, { "year": 2024, "rate": 2.346 }, { "year": 2025, "rate": 2.384 } ],
                    "latest": { "year": 2025, "rate": 2.384 }, "first": { "year": 2020, "rate": 2.161 }, "cut_at_reval": true },
    "rate_change": { "from_year": 2020, "to_year": 2025, "per_year_pct": 1.98 },
    "chapter123": { "district": "0904", "tax_year": 2026, "ratio": 69.39, "lower": 58.98, "upper": 79.8 },
    "revalued_2026": false,
    "holds_up": { "floor": 531704, "implied": 611471, "limit": 79.8, "ratio": 69.39 },
    "town_compare_text": "Among 1,964 homes in Harrison Town, the typical (median) tax bill is ${'$'}10,828. This bill is lower than about 61% of them.",
    "next_deadline": { "date": "April 1, 2027", "note": "May 1 if your town revalues that year" },
    "links": { "property": "https://www.watchdogindex.com/nj/harrison-town/102-grant-ave/0904_9_20",
               "true_cost": "https://www.watchdogindex.com/true-cost?pin=0904_9_20&agent=alex-moreno",
               "checkup": "https://www.watchdogindex.com/checkup?pin=0904_9_20&agent=alex-moreno" }
  }
}
""".trimIndent()

    /** The same row with a server-side price check, as the route returns for `?price=`. */
    fun withPriceCheck(price: Int): String = json.replaceFirst(
        "\"revalued_2026\": false,",
        "\"revalued_2026\": false, \"price_check\": { \"verdict\": \"In line for this price\", \"expected_tax\": 10753, \"text\": \"Homes that sell near ${'$'}$price in Harrison usually pay about ${'$'}10,753.\" },",
    )
}
