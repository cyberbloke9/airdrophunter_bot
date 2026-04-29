package com.terrem.test.data.model

import androidx.compose.ui.graphics.Color

data class Property(
    val id: Int,
    val name: String,
    val type: String,
    val price: String,
    val priceLabel: String = "Per Fraction",
    val location: String,
    val imageGradient: List<Color> = listOf(Color(0xFF8B7355), Color(0xFFD4C5B0)),
    val sqft: String = "",
    val returnPercent: String = "",
    val appreciationPercent: String = "",
    val soldPercent: Int = 0,
    val totalFractions: Int = 12,
    val soldFractions: Int = 0,
    val isHot: Boolean = false,
    val isRera: Boolean = false,
    val isVerified: Boolean = false,
    val hasTenant: Boolean = false,
    val isFavorite: Boolean = false,
    val rating: Float = 0f,
    val reviewCount: Int = 0,
    val description: String = "",
    val deliveryDate: String = "",
    val constructionStatus: String = "",
    val bhkType: String = "",
    val facing: String = "",
    val interiorStatus: String = "",
    val floorNo: String = "",
    val landArea: String = "",
    val builtUpArea: String = "",
    val carpetArea: String = "",
    val commonArea: String = "",
    val totalPrice: String = "",
    val highlights: List<String> = emptyList(),
    val imageCount: Int = 16
)

data class CategoryItem(
    val name: String,
    val icon: String
)

object SampleData {

    val categories = listOf(
        CategoryItem("Office Space", "office"),
        CategoryItem("Industrial", "factory"),
        CategoryItem("Commercial Land", "commercial"),
        CategoryItem("Warehouse", "warehouse"),
    )

    val recentProperties = listOf(
        Property(
            id = 1,
            name = "Sky Dandelions Apartment",
            type = "Apartment",
            price = "₹ 50,000",
            location = "Plot No. 45, Telecom Nagar,\nGachibowli, Hyderabad",
            imageGradient = listOf(Color(0xFF6B5B4F), Color(0xFFBEA68E)),
        ),
        Property(
            id = 2,
            name = "Luxury Sky Villa",
            type = "Bungalow",
            price = "₹ 36,000",
            location = "Villa No. 18, Green Valley Enclave,\nKondapur, Hyderabad",
            imageGradient = listOf(Color(0xFF7A9E7E), Color(0xFFC5D8B5)),
        )
    )

    val recommendations = listOf(
        Property(
            id = 3,
            name = "The Modern House",
            type = "Villa",
            price = "₹ 50,000",
            location = "Villa No. 18, Green Valley Enclave,\nKondapur, Hyderabad",
            imageGradient = listOf(Color(0xFF3D3024), Color(0xFF8B6914)),
            sqft = "2000 sqft",
            returnPercent = "9.1%",
            appreciationPercent = "13.1%",
            totalFractions = 12,
            soldFractions = 6,
            isHot = true,
            isRera = true,
            isVerified = true,
        ),
        Property(
            id = 4,
            name = "The Modern Villa",
            type = "Villa",
            price = "₹ 50,000",
            location = "Villa No. 18, Green Valley Enclave,\nKondapur, Hyderabad",
            imageGradient = listOf(Color(0xFF2E1F15), Color(0xFF6B4226)),
            sqft = "2000 sqft",
            returnPercent = "9.1%",
            appreciationPercent = "13.1%",
            totalFractions = 12,
            soldFractions = 8,
            isHot = false,
            isRera = true,
            isVerified = true,
        ),
        Property(
            id = 9,
            name = "Emerald Heights",
            type = "Apartment",
            price = "₹ 45,000",
            location = "Plot 22, Tech Park Road,\nMadhapur, Hyderabad",
            imageGradient = listOf(Color(0xFF1A4A3A), Color(0xFF4A8E6A)),
            sqft = "1800 sqft",
            returnPercent = "8.5%",
            appreciationPercent = "12.0%",
            totalFractions = 10,
            soldFractions = 7,
            isHot = true,
            isRera = true,
            isVerified = true,
        )
    )

    val trendingProperties = listOf(
        Property(
            id = 5,
            name = "Monsoon Villa",
            type = "Villa",
            price = "₹ 50k",
            location = "Green Valley Encl.,\nVilla 18, Kondapur",
            imageGradient = listOf(Color(0xFF5C3D2E), Color(0xFF8B6B5C)),
            sqft = "2000 sqft",
            returnPercent = "9.1%",
            soldPercent = 64,
        ),
        Property(
            id = 6,
            name = "Modern White Villa",
            type = "Villa",
            price = "₹ 50k",
            location = "Villa 18, Green Valley\nEnclave, Kondapur.",
            imageGradient = listOf(Color(0xFF3A5C4A), Color(0xFF7AAE8A)),
            sqft = "2000 sqft",
            returnPercent = "9.1%",
            soldPercent = 59,
        ),
        Property(
            id = 7,
            name = "Sunset Heights",
            type = "Apartment",
            price = "₹ 40k",
            location = "Villa 11, Orchid Valley,\nNallagandla, Hyd.",
            imageGradient = listOf(Color(0xFF8B4513), Color(0xFFD2691E)),
            sqft = "2000 sqft",
            returnPercent = "9.1%",
            soldPercent = 26,
        ),
        Property(
            id = 8,
            name = "Ocean View Tower",
            type = "Apartment",
            price = "₹ 60k",
            location = "Villa 54, Silver Oaks,\nJubilee Hills, Hyd.",
            imageGradient = listOf(Color(0xFF2F4F6F), Color(0xFF6B8FAF)),
            sqft = "2000 sqft",
            returnPercent = "9.1%",
            soldPercent = 98,
        )
    )

    val detailProperty = Property(
        id = 100,
        name = "Prestige Lakeside Habitat",
        type = "Apartments",
        price = "₹ 50,000",
        location = "Villa 11, Orchid Valley,\nNallagandla, Hyd.",
        imageGradient = listOf(Color(0xFF4A7A5A), Color(0xFF8BC4A0)),
        rating = 4.5f,
        reviewCount = 124,
        description = "Stay in clean, spacious dorms or cozy private rooms equipped with high-speed WiFi, secure lockers, and 24/7 reception. Enjoy fully furnished living with modern amenities, community spaces, and a prime location close to IT parks and metro stations.",
        constructionStatus = "Under Construction",
        deliveryDate = "9th May, 2027",
        isRera = true,
        isVerified = true,
        hasTenant = true,
        bhkType = "3 BHK",
        facing = "North West",
        interiorStatus = "Furnished",
        floorNo = "2nd Floor",
        landArea = "4000 Sq. Yds",
        builtUpArea = "1,950 Sqft",
        carpetArea = "1,700 Sqft",
        commonArea = "3200 Sqft",
        totalPrice = "₹3,923,000/-",
        imageCount = 16,
        highlights = listOf(
            "False Ceiling", "Modular Kitchen", "Home Theatre",
            "2 Private Parking", "Servant Room", "Wardrobes",
            "Rain Water Harvesting", "Swimming Pool", "Gym",
            "Club House", "Children's Play Area", "Power Backup"
        )
    )
}
