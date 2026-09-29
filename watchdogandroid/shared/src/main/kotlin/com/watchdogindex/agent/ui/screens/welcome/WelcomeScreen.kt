package com.watchdogindex.agent.ui.screens.welcome

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.watchdogindex.agent.ui.nav.Navigator

/** Placeholder until the real screen lands; keeps ScreenHost compiling. */
@Composable
fun WelcomeScreen(navigator: Navigator) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("WelcomeScreen") }
}
