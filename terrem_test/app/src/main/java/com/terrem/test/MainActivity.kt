package com.terrem.test

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.terrem.test.ui.components.TerremBottomBar
import com.terrem.test.ui.navigation.Routes
import com.terrem.test.ui.navigation.TerremNavGraph
import com.terrem.test.ui.theme.TerremTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            TerremTheme {
                TerremApp()
            }
        }
    }
}

@Composable
fun TerremApp() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route ?: Routes.HOME

    // Hide bottom bar on detail screen
    val showBottomBar = currentRoute != Routes.PROPERTY_DETAIL

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                TerremBottomBar(
                    currentRoute = currentRoute,
                    onNavigate = { route ->
                        if (route != "center") {
                            navController.navigate(route) {
                                popUpTo(Routes.HOME) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    }
                )
            }
        }
    ) { paddingValues ->
        // Only apply bottom padding when bottom bar is shown
        val modifier = if (showBottomBar) {
            Modifier.padding(bottom = paddingValues.calculateBottomPadding())
        } else {
            Modifier
        }
        androidx.compose.foundation.layout.Box(modifier = modifier) {
            TerremNavGraph(navController = navController)
        }
    }
}
