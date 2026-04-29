package com.terrem.test.ui

import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.ViewModel
import com.terrem.test.data.model.Property
import com.terrem.test.data.model.SampleData

class TerremViewModel : ViewModel() {
    val selectedCity = mutableStateOf("Hyderabad")
    val cities = listOf("Hyderabad", "Bangalore", "Mumbai", "Delhi", "Chennai", "Pune")

    val selectedFractionalTab = mutableStateOf(0)
    val searchQuery = mutableStateOf("")
    val selectedCategory = mutableStateOf("")
    val selectedPropertyType = mutableStateOf("Commercial")

    private val _favorites = mutableStateListOf<Int>()
    val favorites: List<Int> get() = _favorites

    val recentProperties: List<Property> get() = SampleData.recentProperties
    val recommendations: List<Property> get() = SampleData.recommendations
    val trendingProperties: List<Property> get() = SampleData.trendingProperties
    val detailProperty: Property get() = SampleData.detailProperty

    fun toggleFavorite(propertyId: Int) {
        if (_favorites.contains(propertyId)) {
            _favorites.remove(propertyId)
        } else {
            _favorites.add(propertyId)
        }
    }

    fun isFavorite(propertyId: Int): Boolean = _favorites.contains(propertyId)
}
