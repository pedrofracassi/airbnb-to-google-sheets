from datetime import datetime
from functools import lru_cache
from typing import Dict, Optional, Tuple

import pyairbnb
import requests
import ua_generator
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cache for price data with TTL (store tuples of (timestamp, price_data))
price_cache: Dict[str, Tuple[float, dict]] = {}
CACHE_TTL = 3600  # 1 hour in seconds

# Add this near the other cache declarations
og_metadata_cache: Dict[str, Tuple[float, Tuple[Optional[str], Optional[str]]]] = {}


@lru_cache(maxsize=100)
def get_cached_listing_details(url: str, currency: str) -> dict:
    details = pyairbnb.get_details(
        room_url=url, currency=currency, domain="www.airbnb.com.br"
    )

    return details


def get_cache_key(product_id: str, check_in: str, check_out: str, currency: str) -> str:
    """Generate a unique cache key for price data"""
    return f"{product_id}:{check_in}:{check_out}:{currency}"


def get_cached_price(cache_key: str, current_time: float) -> Optional[dict]:
    """Get price from cache if it exists and hasn't expired"""
    if cache_key in price_cache:
        timestamp, price_data = price_cache[cache_key]
        if current_time - timestamp < CACHE_TTL:
            return price_data
        else:
            del price_cache[cache_key]
    return None


def parse_sub_description_items(
    items: list[str],
) -> tuple[Optional[int], Optional[int], Optional[int]]:
    """Parse room, bed, and bath counts from sub_description items based on their order
    Expected order: guests, bedrooms, beds, baths"""
    beds = None
    baths = None
    bedrooms = None

    try:
        # Skip guests (index 0) and get bedrooms, beds, baths from indices 1, 2, 3
        if len(items) >= 4:
            bedrooms = int(items[1].split()[0])
            beds = int(items[2].split()[0])
            baths = int(items[3].split()[0])
    except (IndexError, ValueError):
        # If parsing fails, return None values
        pass

    return beds, baths, bedrooms


class ListingResponse(BaseModel):
    name: str
    total_price: float
    image_url: str
    beds: Optional[int]
    baths: Optional[float]
    bedrooms: Optional[int]
    location_name: str
    latitude: Optional[float]
    longitude: Optional[float]
    guest_satisfaction: Optional[float]
    min_nights: Optional[int]
    max_nights: Optional[int]


def get_cached_og_metadata(
    url: str, current_time: float
) -> Optional[Tuple[Optional[str], Optional[str]]]:
    """Get og metadata from cache if it exists and hasn't expired"""
    if url in og_metadata_cache:
        timestamp, metadata = og_metadata_cache[url]
        if current_time - timestamp < CACHE_TTL:
            return metadata
        else:
            del og_metadata_cache[url]
    return None


def get_og_metadata(url: str) -> tuple[Optional[str], Optional[str]]:
    """Fetch og:image and title from the listing URL"""
    current_time = datetime.now().timestamp()

    # Check cache first
    cached_metadata = get_cached_og_metadata(url, current_time)
    if cached_metadata:
        return cached_metadata

    try:
        headers = {"User-Agent": str(ua_generator.generate())}
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        og_image = soup.find("meta", property="og:image")
        title = soup.find("title")

        image_url = None
        if og_image and og_image.get("content"):
            content = og_image["content"]
            # Remove any URL parameters to get the clean image URL
            image_url = content.split("?")[0]

        page_title = None
        if title:
            page_title = title.text.split(" - ")[0].strip()

        # Cache the results
        og_metadata_cache[url] = (current_time, (image_url, page_title))

        return image_url, page_title
    except Exception as e:
        print(f"Error fetching og metadata: {e}")
        return None, None


@app.get("/listing-details", response_model=ListingResponse)
async def get_listing_details(
    url: str,
    check_in: str,  # Format: YYYY-MM-DD
    check_out: str,  # Format: YYYY-MM-DD
    currency: str = "USD",
):
    try:
        # Get initial metadata and price information
        data, price_input, cookies = pyairbnb.get_metadata_from_url(url, "")

        # Get cached listing details
        listing_details = get_cached_listing_details(url, currency)

        # Get og:image and title from the listing URL
        image_url, page_title = get_og_metadata(url)

        # Try to get cached price
        current_time = datetime.now().timestamp()
        cache_key = get_cache_key(
            price_input["product_id"], check_in, check_out, currency
        )

        price_data = get_cached_price(cache_key, current_time)

        if price_data is None:
            # Get fresh price data and cache it
            price_data = pyairbnb.get_price(
                price_input["product_id"],
                price_input["impression_id"],
                price_input["api_key"],
                currency,
                cookies,
                check_in,
                check_out,
                "",
            )
            print(price_data)
            price_cache[cache_key] = (current_time, price_data)

        # Extract required information
        pdp_listing_detail = listing_details.get("pdp_listing_detail", {})
        listing = pdp_listing_detail.get("listing", {})

        # Get counts from sub_description
        sub_description = listing_details.get("sub_description", {})
        sub_items = sub_description.get("items", [])
        beds, baths, bedrooms = parse_sub_description_items(sub_items)

        # Get min and max nights from calendar data
        calendar = listing_details.get("calendar", [])
        min_nights = None
        max_nights = None
        if calendar and len(calendar) > 0:
            first_month = calendar[0]
            if "conditionRanges" in first_month:
                first_condition = first_month["conditionRanges"][0]
                if "conditions" in first_condition:
                    conditions = first_condition["conditions"]
                    min_nights = conditions.get("minNights")
                    max_nights = conditions.get("maxNights")

        # Extract total price from the 'Total before taxes' field
        total_price_str = price_data.get("details", {}).get("Total before taxes", "0")
        # Remove currency symbol and convert to float
        total_price = float(
            total_price_str.split(" ")[-1].replace(",", "").replace("R$", "")
        )

        # Get location name from location_descriptions
        location_descriptions = listing_details.get("location_descriptions", [])
        location_name = ""
        if location_descriptions and len(location_descriptions) > 0:
            location_name = location_descriptions[0].get("title", "")

        # Get coordinates from listing details
        coordinates = listing_details.get("coordinates", {})
        latitude = coordinates.get("latitude")
        longitude = coordinates.get("longitude")

        # Get guest satisfaction from rating object
        guest_satisfaction = listing_details.get("rating", {}).get("guest_satisfaction")

        response = ListingResponse(
            name=page_title or listing.get("name", ""),
            total_price=total_price,
            image_url=image_url or (listing.get("picture_urls", [None])[0] or ""),
            beds=beds,
            baths=baths,
            bedrooms=bedrooms,
            location_name=location_name,
            latitude=latitude,
            longitude=longitude,
            guest_satisfaction=guest_satisfaction,
            min_nights=min_nights,
            max_nights=max_nights,
        )

        return response

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
