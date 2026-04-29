package com.terrem.test.ui.navigation

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.terrem.test.ui.TerremViewModel
import com.terrem.test.ui.screens.*

object Routes {
    const val HOME = "home"
    const val ACTIVITY = "activity"
    const val PORTFOLIO = "portfolio"
    const val ALERTS = "alerts"
    const val PROPERTY_DETAIL = "property_detail/{propertyId}"

    fun propertyDetail(propertyId: Int) = "property_detail/$propertyId"
}

@Composable
fun TerremNavGraph(navController: NavHostController, viewModel: TerremViewModel) {
    NavHost(
        navController = navController,
        startDestination = Routes.HOME,
        enterTransition = { fadeIn(tween(300)) + slideInVertically(tween(300)) { 60 } },
        exitTransition = { fadeOut(tween(200)) },
        popEnterTransition = { fadeIn(tween(300)) },
        popExitTransition = { fadeOut(tween(200)) + slideOutVertically(tween(200)) { 60 } }
    ) {
        composable(Routes.HOME) {
            HomeScreen(
                viewModel = viewModel,
                onPropertyClick = { propertyId ->
                    navController.navigate(Routes.propertyDetail(propertyId))
                }
            )
        }

        composable(Routes.ACTIVITY) { ActivityScreen() }
        composable(Routes.PORTFOLIO) { PortfolioScreen() }
        composable(Routes.ALERTS) { AlertsScreen() }

        composable(
            Routes.PROPERTY_DETAIL,
            enterTransition = {
                slideInVertically(tween(350)) { it / 3 } + fadeIn(tween(350))
            },
            exitTransition = { fadeOut(tween(200)) },
            popExitTransition = {
                slideOutVertically(tween(300)) { it / 3 } + fadeOut(tween(250))
            }
        ) {
            PropertyDetailScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
