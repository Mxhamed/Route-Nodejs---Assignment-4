const express = require("express");
const path = require("path");
const fs = require("fs/promises");

// Constants
const PORT = process.env.PORT || 3000;
const filePath = path.resolve("./users.json");
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Initialize Express App
const app = express();

// Middleware
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Cache to Avoid Reading File on EVERY Request
let usersCache = null;

// Custom Error Class
class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

// ============================================
// UTILITIES MODULE
// ============================================
const utils = {
  // Validation → Check Email Format
  isValidEmail(email) {
    return EMAIL_REGEX.test(email);
  },

  // Validation → Check Age
  isValidAge(age) {
    return typeof age === "number" && age > 0 && Number.isInteger(age);
  },

  // Sanitize User Input
  sanitizeUser(data) {
    return {
      name: data.name ? String(data.name).trim() : undefined,
      email: data.email ? String(data.email).trim().toLowerCase() : undefined,
      age: data.age ? parseInt(data.age, 10) : undefined,
    };
  },
};

// ============================================
// DATABASE MODULE
// ============================================
const db = {
  // Helper → Read Users from File
  async readUsers() {
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data);
    } catch (err) {
      // If File DOESN'T Exist → Return Empty Array
      if (err.code === "ENOENT") {
        return [];
      }
      throw err;
    }
  },

  // Helper → Write Users to File
  async writeUsers(users) {
    await fs.writeFile(filePath, JSON.stringify(users, null, 2), "utf-8");
    // Update Cache AFTER Writing
    usersCache = users;
  },

  // Helper → Get Users
  async getUsers(useCache = true) {
    // Use Cache if Available
    if (useCache && usersCache) {
      return usersCache;
    }

    // Read from File
    const users = await this.readUsers();
    usersCache = users;
    return users;
  },
};

// ============================================
// MIDDLEWARE
// ============================================

// Attach Utils to Request Object
app.use((req, res, next) => {
  req.utils = utils;
  req.db = db;
  next();
});

// ============================================
// ROUTES
// ============================================

// Route → GET /user - Get ALL Users
app.get("/user", async (req, res, next) => {
  try {
    const users = await req.db.getUsers(true); // Use Cache
    res.status(200).json(users);
  } catch (err) {
    next(err);
  }
});

// Route → GET /user/getByName - Get User by Name
app.get("/user/getByName", async (req, res, next) => {
  try {
    const { name } = req.query;

    if (!name) {
      throw new AppError(400, "Name Query Parameter is Required!");
    }

    const users = await req.db.getUsers(true); // Use Cache
    const user = users.find((u) => u.name.toLowerCase() === name.toLowerCase());

    if (!user) {
      return res.status(404).json({ message: "NO User with Such Name Found!" });
    }

    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
});

// Route → GET /user/filter - Filter Users by Minimum Age
app.get("/user/filter", async (req, res, next) => {
  try {
    const { minAge } = req.query;

    if (!minAge) {
      throw new AppError(400, "minAge Query Parameter is Required!");
    }

    const minAgeNum = parseInt(minAge, 10);

    if (isNaN(minAgeNum) || minAgeNum < 0) {
      throw new AppError(400, "minAge MUST be a Valid Positive Number!");
    }

    const users = await req.db.getUsers(true); // Use Cache
    const filteredUsers = users.filter((u) => u.age >= minAgeNum);

    if (filteredUsers.length === 0) {
      return res.status(404).json({ message: "NO User Found!" });
    }

    res.status(200).json(filteredUsers);
  } catch (err) {
    next(err);
  }
});

// Route → GET /user/:id - Get User by ID
app.get("/user/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      throw new AppError(400, "Invalid User ID!");
    }

    const users = await req.db.getUsers(true); // Use Cache
    const user = users.find((u) => u.id === id);

    if (!user) {
      return res.status(404).json({ message: "User NOT Found!" });
    }

    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
});

// Route → POST /user - Create New User
app.post("/user", async (req, res, next) => {
  try {
    const sanitized = req.utils.sanitizeUser(req.body);

    // Validate Required Fields
    if (!sanitized.name || !sanitized.email || !sanitized.age) {
      throw new AppError(422, "Name, Email, and Age are Required!");
    }

    // Validate Email Format
    if (!req.utils.isValidEmail(sanitized.email)) {
      throw new AppError(422, "Invalid Email Format!");
    }

    // Validate Age
    if (!req.utils.isValidAge(sanitized.age)) {
      throw new AppError(422, "Age MUST be a Positive Integer!");
    }

    // Read Users (DON'T Use Cache, We Need Fresh Data)
    const users = await req.db.getUsers(false);

    // Check for Duplicate Email
    const existingUser = users.find((u) => u.email === sanitized.email);
    if (existingUser) {
      throw new AppError(409, "Email ALREADY Exists!");
    }

    // Create New User
    const newUser = {
      id: Date.now(),
      name: sanitized.name,
      email: sanitized.email,
      age: sanitized.age,
    };

    users.push(newUser);
    await req.db.writeUsers(users);

    res.status(201).json({ message: "User Created Successfully!" });
  } catch (err) {
    next(err);
  }
});

// Route → PATCH /user/:id - Update User
app.patch("/user/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      throw new AppError(400, "Invalid User ID!");
    }

    const sanitized = req.utils.sanitizeUser(req.body);

    // At Least One Field MUST be Provided
    if (!sanitized.name && !sanitized.email && !sanitized.age) {
      throw new AppError(422, "At Least One Field MUST be Provided!");
    }

    // Validate Email IF Provided
    if (sanitized.email && !req.utils.isValidEmail(sanitized.email)) {
      throw new AppError(422, "Invalid Email Format!");
    }

    // Validate Age IF Provided
    if (sanitized.age !== undefined && !req.utils.isValidAge(sanitized.age)) {
      throw new AppError(422, "Age MUST be a Positive Integer!");
    }

    // Read Users (DON'T Use Cache)
    const users = await req.db.getUsers(false);

    // Find User
    const userIndex = users.findIndex((u) => u.id === id);
    if (userIndex === -1) {
      throw new AppError(404, "User NOT Found!");
    }

    // Check for Duplicate Email IF Email is being Updated
    if (sanitized.email) {
      const duplicate = users.find(
        (u) => u.email === sanitized.email && u.id !== id
      );
      if (duplicate) {
        throw new AppError(409, "Email ALREADY Exists!");
      }
    }

    // Update User
    if (sanitized.name) users[userIndex].name = sanitized.name;
    if (sanitized.email) users[userIndex].email = sanitized.email;
    if (sanitized.age) users[userIndex].age = sanitized.age;

    await req.db.writeUsers(users);

    res.status(200).json({ message: "User Updated Successfully!" });
  } catch (err) {
    next(err);
  }
});

// Route → DELETE /user/:id - Delete User
app.delete("/user/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      throw new AppError(400, "Invalid User ID!");
    }

    // Read Users (DON'T Use Cache)
    const users = await req.db.getUsers(false);

    const userIndex = users.findIndex((u) => u.id === id);

    if (userIndex === -1) {
      return res.status(404).json({ message: "User NOT Found!" });
    }

    users.splice(userIndex, 1);
    await req.db.writeUsers(users);

    res.status(200).json({ message: "User Deleted Successfully!" });
  } catch (err) {
    next(err);
  }
});

// ============================================
// ERROR HANDLERS
// ============================================

// 404 Handler - Route NOT Found
app.use((req, res) => {
  res.status(404).json({ message: "Route NOT Found!" });
});

// Global Error Handler
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }

  // Log Unexpected Errors
  console.error("🚨 Server Error:", err);
  res.status(500).json({ message: "Something Broke!" });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log("🚀 Server Running on http://localhost:" + PORT);
  console.log("📁 Users File:", filePath);
});
