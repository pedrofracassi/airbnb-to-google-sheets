/**
 * Calculates the travel time between a location and an Airbnb listing
 * @param {string} origin Starting location
 * @param {string} airbnbUrl URL of the Airbnb listing
 * @param {string} mode Optional: Travel mode ("driving", "walking", "bicycling", "transit"). Defaults to "driving"
 * @return {number} Travel time in days
 * @customfunction
 */
function GETTRAVELTIME(origin, airbnbUrl, mode = "driving") {
  try {
    // Get coordinates from Airbnb listing
    const lat = GETAIRBNBDETAIL(airbnbUrl, "latitude");
    const lng = GETAIRBNBDETAIL(airbnbUrl, "longitude");

    if (!lat || !lng) {
      throw new Error("Could not get coordinates from Airbnb listing");
    }

    const destination = `${lat},${lng}`;

    const directions = Maps.newDirectionFinder()
      .setOrigin(origin)
      .setDestination(destination)
      .setMode(mode)
      .getDirections();

    const route = directions.routes[0];
    const seconds = route.legs[0].duration.value;
    return seconds / (24 * 60 * 60); // Convert seconds to days
  } catch (error) {
    return "Error: " + error.toString();
  }
}

/**
 * Calculates the travel time between a location and coordinates
 * @param {string} origin Starting location
 * @param {number} lat Destination latitude
 * @param {number} lng Destination longitude
 * @param {string} mode Optional: Travel mode ("driving", "walking", "bicycling", "transit"). Defaults to "driving"
 * @return {number} Travel time in days
 * @customfunction
 */
function GETTRAVELTIMECOORDS(origin, lat, lng, mode = "driving") {
  try {
    if (typeof lat !== "number" || typeof lng !== "number") {
      throw new Error("Latitude and longitude must be numbers");
    }

    const destination = `${lat},${lng}`;

    const directions = Maps.newDirectionFinder()
      .setOrigin(origin)
      .setDestination(destination)
      .setMode(mode)
      .getDirections();

    const route = directions.routes[0];
    const seconds = route.legs[0].duration.value;
    return seconds / (24 * 60 * 60); // Convert seconds to days
  } catch (error) {
    return "Error: " + error.toString();
  }
}

/**
 * Internal function to fetch all Airbnb listing details in a single request
 * @param {string} url The URL of the Airbnb listing
 * @param {string} checkIn Optional: Check-in date in YYYY-MM-DD format
 * @param {string} checkOut Optional: Check-out date in YYYY-MM-DD format
 * @param {string} currency Optional: Currency code. Defaults to "BRL"
 * @return {object} Object containing all listing details
 */
function fetchAirbnbDetails(
  url,
  checkIn = "",
  checkOut = "",
  currency = "BRL"
) {
  try {
    const scriptProps = PropertiesService.getScriptProperties();
    const baseUrl = scriptProps.getProperty("BASE_URL");

    if (!baseUrl) {
      throw new Error("BASE_URL script property not set");
    }

    // If dates aren't provided, use default dates (tomorrow and day after)
    if (!checkIn || !checkOut) {
      const today = new Date();
      const defaultCheckIn = new Date(today);
      defaultCheckIn.setDate(today.getDate() + 1);
      const defaultCheckOut = new Date(today);
      defaultCheckOut.setDate(today.getDate() + 2);

      checkIn = checkIn || defaultCheckIn.toISOString().split("T")[0];
      checkOut = checkOut || defaultCheckOut.toISOString().split("T")[0];
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(checkIn) || !dateRegex.test(checkOut)) {
      throw new Error("Dates must be in YYYY-MM-DD format");
    }

    const apiUrl =
      `${baseUrl}/listing-details?` +
      `url=${encodeURIComponent(url)}` +
      `&check_in=${checkIn}` +
      `&check_out=${checkOut}` +
      `&currency=${currency}`;

    const response = UrlFetchApp.fetch(apiUrl);
    const data = JSON.parse(response.getContentText());

    return {
      name: data.name,
      locationName: data.location_name,
      totalPrice: data.total_price,
      numBaths: data.baths,
      numBeds: data.beds,
      numRooms: data.bedrooms,
      image: data.image_url,
      latitude: data.latitude,
      longitude: data.longitude,
      guestSatisfaction: data.guest_satisfaction,
      minNights: data.min_nights,
      maxNights: data.max_nights,
    };
  } catch (error) {
    Logger.log("Error in fetchAirbnbDetails: " + error);
    throw error;
  }
}

/**
 * Returns all Airbnb listing details as a row
 * @param {string} url The URL of the Airbnb listing
 * @param {string} checkIn Optional: Check-in date in YYYY-MM-DD format
 * @param {string} checkOut Optional: Check-out date in YYYY-MM-DD format
 * @param {string} currency Optional: Currency code. Defaults to "BRL"
 * @return {Array} Row array containing all listing details
 * @customfunction
 */
function GETAIRBNBROW(url, checkIn = "", checkOut = "", currency = "BRL") {
  try {
    const details = fetchAirbnbDetails(url, checkIn, checkOut, currency);
    return [
      [
        details.name,
        details.locationName,
        details.totalPrice,
        details.numBaths,
        details.numBeds,
        details.numRooms,
        details.image,
        details.latitude,
        details.longitude,
        details.guestSatisfaction,
        details.minNights,
        details.maxNights,
      ],
    ];
  } catch (error) {
    return [["Error: " + error.toString()]];
  }
}

/**
 * Modified GETAIRBNBDETAIL to use the shared fetching function
 */
function GETAIRBNBDETAIL(
  url,
  detail = "name",
  checkIn = "",
  checkOut = "",
  currency = "BRL"
) {
  try {
    const details = fetchAirbnbDetails(url, checkIn, checkOut, currency);
    return details[detail] || null;
  } catch (error) {
    Logger.log("Error in GETAIRBNBDETAIL: " + error);
    return "Error: " + error.toString();
  }
}

/**
 * Extracts Airbnb listing details from a given URL using Cheerio.
 *
 * @param {string} url The URL of the Airbnb listing.
 * @return {object} An object containing the listing details, or null if
 *                  extraction fails.  The object has the following keys:
 *                  - name: The name of the listing.
 *                  - locationName: The location of the listing.
 *                  - totalPrice: The total price of the listing.
 *                  - numBaths: The number of bathrooms.
 *                  - numBeds: The number of beds.
 *                  - numRooms: The number of rooms.
 */
function getAirbnbListingDetails(url) {
  console.log(url);

  try {
    const response = UrlFetchApp.fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_6) AppleWebKit/533.34 (KHTML, like Gecko) Chrome/47.0.3501.320 Safari/535",
      },
    });
    const html = response.getContentText();

    // Load HTML using Cheerio
    const $ = Cheerio.load(html);

    // Extract data using Cheerio selectors
    const ogTitle = $('meta[property="og:title"]').attr("content") || null;
    const ogImage = $('meta[property="og:image"]').attr("content") || null;

    let name = null;
    let locationName = null;
    let numRooms = null;
    let numBeds = null;
    let numBaths = null;

    if (ogTitle) {
      const parts = ogTitle.split(" · ");
      if (parts.length > 0) {
        name = parts[0].trim();
      }
      if (parts.length > 1) {
        locationName = parts[0].trim();
        const details = parts.slice(1);

        details.forEach((detail) => {
          if (detail.includes("bedrooms") || detail.includes("quartos")) {
            numRooms = detail
              .replace(" bedrooms", "")
              .replace(" quartos", "")
              .trim();
          } else if (detail.includes("beds") || detail.includes("camas")) {
            numBeds = detail.replace(" beds", "").replace(" camas", "").trim();
          } else if (detail.includes("baths") || detail.includes("banheiros")) {
            numBaths = detail
              .replace(" baths", "")
              .replace(" banheiros", "")
              .trim();
          }
        });
      }
    }

    // Total Price (still using the original method)
    let totalPrice = null;
    const totalPriceElement = $("._ati8ih span._1qgfaxb1");
    if (totalPriceElement.length > 0) {
      totalPrice = totalPriceElement
        .text()
        .replace("R$", "")
        .replace(" total", "")
        .trim();
    }

    return {
      name: name,
      image: ogImage,
      locationName: locationName,
      totalPrice: totalPrice,
      numBaths: Number(numBaths),
      numBeds: Number(numBeds),
      numRooms: Number(numRooms),
    };
  } catch (e) {
    Logger.log("Error extracting data: " + e);
    return null;
  }
}
