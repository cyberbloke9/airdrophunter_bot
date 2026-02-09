package com.terrem.test.data.model

data class Property(
    val id: Int,
    val name: String,
    val type: String,
    val price: String,
    val priceLabel: String = "Per Fraction",
    val location: String,
    val imageRes: String = "",
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
    val highlights: List<String> = emptyList()
)

object SampleData {
    val recentProperties = listOf(
        Property(
            id = 1,
            name = "Sky Dandelions Apartment",
            type = "Apartment",
            price = "₹ 50,000",
            location = "Plot No. 45, Telecom Nagar,\nGachibowli, Hyderabad",
        ),
        Property(
            id = 2,
            name = "Luxury Sky Villa",
            type = "Bungalow",
            price = "₹ 36,000",
            location = "Villa No. 18, Green Valley Enclave,\nKondapur, Hyderabad",
        )
    )

    val recommendations = listOf(
        Property(
            id = 3,
            name = "The Modern House",
            type = "Villa",
            price = "₹ 50,000",
            location = "Villa No. 18, Green Valley Enclave,\nKondapur, Hyderabad",
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
            sqft = "2000 sqft",
            returnPercent = "9.1%",
            appreciationPercent = "13.1%",
            totalFractions = 12,
            soldFractions = 6,
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
        rating = 4.5f,
        reviewCount = 124,
        description = "Stay in clean, spacious dorms or cozy private rooms equipped with high-speed WiFi, secure l...",
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
        highlights = listOf(
            "False Ceiling", "Modular Kitchen", "Home Theatre",
            "2 Private Parking", "Servant Room", "Wardrobes"
        )
    )
}
