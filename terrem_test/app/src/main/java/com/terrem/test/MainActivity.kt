package com.terrem.test

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.*
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.terrem.test.ui.TerremViewModel
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
    val viewModel: TerremViewModel = viewModel()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route ?: Routes.HOME

    val showBottomBar = currentRoute != Routes.PROPERTY_DETAIL

    Scaffold(
        bottomBar = {
            AnimatedVisibility(
                visible = showBottomBar,
                enter = slideInVertically { it } + fadeIn(),
                exit = slideOutVertically { it } + fadeOut()
            ) {
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
        Box(
            modifier = if (showBottomBar) {
                Modifier.padding(bottom = paddingValues.calculateBottomPadding())
            } else {
                Modifier
            }
        ) {
            TerremNavGraph(navController = navController, viewModel = viewModel)
        }
    }
}
