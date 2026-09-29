package com.watchdogindex.agent.app

import androidx.compose.ui.text.font.FontFamily
import com.watchdogindex.agent.core.repo.KeyValueStore
import com.watchdogindex.agent.core.sample.InMemoryKeyValueStore
import com.watchdogindex.agent.core.sample.SampleRepositories
import com.watchdogindex.agent.platform.PlatformServices

/**
 * The object graph that runs on the approved mockups' fictional data set: every repository is a
 * [SampleRepositories] one, so nothing here touches the network. The desktop preview window, the screenshot
 * harness, tests and the app's demo mode all build one of these; the Android app builds a live graph instead
 * once the agent signs in.
 *
 * [store] keeps the sample's preferences and toggles for the life of the graph (an in-memory store by
 * default, so every harness run starts clean). [signedIn] false makes the sample auth repository report a
 * signed-out state, which is how the preview starts on the Welcome screen.
 */
class SampleAppGraph(
    override val platform: PlatformServices,
    override val fontFamily: FontFamily,
    store: KeyValueStore = InMemoryKeyValueStore(),
    signedIn: Boolean = true,
) : AppGraph {
    // Typed as the sample class so hosts can reach sample-only helpers; screens still see it as Repositories.
    override val repos: SampleRepositories = SampleRepositories(store, signedIn)
}
