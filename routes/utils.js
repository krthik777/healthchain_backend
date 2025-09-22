const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');
const axios = require('axios');
const mongoose = require('mongoose');

const router = express.Router();

// @route   GET /api/users
// @desc    Get all users
// @access  Private (health_department, region_admin)
router.get('/userslist',
    //  auth(['health_department', 'region_admin', 'receptionist', 'doctor']), 
     async (req, res) => {
    try {
        const users = await User.find().select('-password'); // Exclude passwords
        res.json(users);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/num-users
// @desc    Get total number of users
// @access  Private (health_department, region_admin)
router.get('/num-patient',
    //  auth(['health_department', 'region_admin']), 
     async (req, res) => {
    try {
        const count = await User.countDocuments({ role: 'patient' });
        res.json({ totalUsers: count });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.get("/num-pinata", async (req, res) => {
  try {
    const PINATA_JWT = process.env.PINATA_JWT;
    const PINATA_API_KEY = process.env.PINATA_API_KEY;
    const PINATA_API_SECRET = process.env.PINATA_API_SECRET;

    if (!PINATA_JWT && (!PINATA_API_KEY || !PINATA_API_SECRET)) {
      return res.status(500).json({
        error:
          "Pinata credentials are not configured. Set PINATA_JWT or (PINATA_API_KEY & PINATA_API_SECRET).",
      });
    }

    const baseUrl = "https://api.pinata.cloud/data/pinList";
    // Ask for count only and minimal rows (cheapest)
    const url = `${baseUrl}?includeCount=true&pageLimit=1`;

    const headers = PINATA_JWT
      ? { Authorization: `Bearer ${PINATA_JWT}` }
      : {
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_API_SECRET,
        };

    // primary attempt: use includeCount to get a total quickly
    const resp = await axios.get(url, {
      headers,
      timeout: 30_000,
    });

    // Try to extract count from the response (Pinata may return different shapes)
    let count = null;
    if (resp && resp.data) {
      // common: resp.data.count (older pinning API shape)
      if (typeof resp.data.count === "number") {
        count = resp.data.count;
      }
      // some endpoints may use rows + metadata; fallback to headers
      else if (typeof resp.data.total === "number") {
        count = resp.data.total;
      } else if (Array.isArray(resp.data.rows) && resp.data.rows.length === 0) {
        // if includeCount=true didn't return 'count' but rows is empty, treat as 0
        count = 0;
      }
    }

    // Also check for common X headers that might contain total
    if (count == null && resp && resp.headers) {
      const headerCount =
        resp.headers["x-total-count"] ||
        resp.headers["x-count"] ||
        resp.headers["x-totalresults"] ||
        resp.headers["x-total-results"];
      if (headerCount) {
        const parsed = Number(headerCount);
        if (!isNaN(parsed)) count = parsed;
      }
    }

    // If still unknown, fallback to paginated counting (safe but may be slow / rate-limited)
    if (count == null) {
      // Paginate with a large pageLimit to minimize requests
      const pageLimit = 1000; // max allowed in docs
      let pageOffset = 0;
      let total = 0;
      const MAX_PAGES = 50; // safety cap (50 * 1000 = 50k items max)
      let pages = 0;

      while (pages < MAX_PAGES) {
        const pageUrl = `${baseUrl}?status=all&pageLimit=${pageLimit}&pageOffset=${pageOffset}`;
        const r = await axios.get(pageUrl, { headers, timeout: 30_000 });
        const rows = r.data && Array.isArray(r.data.rows) ? r.data.rows : [];
        total += rows.length;

        // if fewer rows returned than requested, we reached the end
        if (rows.length < pageLimit) break;

        pageOffset += pageLimit;
        pages += 1;

        // small delay to be polite with Pinata rate limits (endpoints under /data/ have stricter rate limits)
        await new Promise((resolve) => setTimeout(resolve, 200)); // 200ms
      }

      count = total;
    }

    // If still null for some reason, return an explicit error
    if (count == null) {
      return res
        .status(502)
        .json({ error: "Could not determine Pinata file count (no count returned)." });
    }

    // respond with the final count
    return res.json({
      count,
      source: "pinata",
      note:
        count === 0
          ? "No pinned files found (or access-limited key)."
          : undefined,
    });
  } catch (err) {
    console.error("num-pinata error:", err && (err.response?.data || err.message || err));
    // surface Pinata error details if present
    const pinErr =
      err && err.response && err.response.data
        ? err.response.data
        : { message: err.message || "unknown error" };
    return res.status(500).json({ error: "Failed to query Pinata", details: pinErr });
  }
});

module.exports = router;