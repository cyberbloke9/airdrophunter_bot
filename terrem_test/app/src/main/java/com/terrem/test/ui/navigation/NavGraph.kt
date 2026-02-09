package com.terrem.test.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
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
fun TerremNavGraph(navController: NavHostController) {
    NavHost(
        navController = navController,
        startDestination = Routes.HOME
    ) {
        composable(Routes.HOME) {
            HomeScreen(
                onPropertyClick = { propertyId ->
                    navController.navigate(Routes.propertyDetail(propertyId))
                }
            )
        }

        composable(Routes.ACTIVITY) {
            ActivityScreen()
        }

        composable(Routes.PORTFOLIO) {
            PortfolioScreen()
        }

        composable(Routes.ALERTS) {
            AlertsScreen()
        }

        composable(Routes.PROPERTY_DETAIL) {
            PropertyDetailScreen(
                onBack = { navController.popBackStack() }
            )
        }
    }
}
