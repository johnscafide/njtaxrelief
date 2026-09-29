package com.watchdogindex.agent.app

import androidx.compose.runtime.Composable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel

/**
 * One way to get a ViewModel in every screen: `val vm = screenViewModel { TodayViewModel(graph.repos) }`.
 * Works on Android (activity/nav-entry store) and in the desktop preview (the harness provides a store owner).
 * [key] separates instances of the same class, e.g. one PropertyViewModel per PIN.
 */
@Composable
inline fun <reified VM : ViewModel> screenViewModel(key: String? = null, crossinline create: () -> VM): VM =
    viewModel(key = key ?: VM::class.qualifiedName, initializer = { create() })
