const express = require("express");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.get("/health", async (req, res) => {
  const dbStatus = await db.checkConnection();

  res.status(200).json({
    status: "ok",
    service: "backend-api",
    database: dbStatus.connected ? "connected" : "disconnected",
    databaseType: dbStatus.type,
    time: new Date().toISOString(),
  });
});

app.get("/api/message", (req, res) => {
  res.status(200).json({
    message: "Hello from multi-cloud backend API",
    connected: true,
  });
});

app.post("/api/echo", (req, res) => {
  res.status(200).json({
    youSent: req.body,
  });
});

// Dashboard endpoint - returns app statistics
app.get("/api/dashboard", async (req, res) => {
  try {
    let userCount = 0;
    const dbStatus = await db.checkConnection();

    if (dbStatus.connected) {
      if (["mongodb", "cosmosdb"].includes(db.dbType.toLowerCase())) {
        const result = await db.documentQuery("count", "users", {});
        userCount = result;
      } else {
        const result = await db.query("SELECT COUNT(*) as count FROM users");
        userCount = result.rows[0]?.count || 0;
      }
    }

    res.status(200).json({
      status: "ok",
      databaseType: db.dbType,
      statistics: {
        totalUsers: userCount,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
      features: ["User Management", "Multi-Cloud Database", "Settings"],
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// Settings endpoint - returns application settings
app.get("/api/settings", (req, res) => {
  res.status(200).json({
    appName: "Multi-Cloud User Management",
    version: "2.0.0",
    database: db.dbType,
    features: {
      userManagement: true,
      multiCloud: true,
      pathBasedRouting: true,
    },
    supportedDatabases: [
      "PostgreSQL",
      "MySQL",
      "SQL Server",
      "MongoDB",
      "Cosmos DB",
    ],
    config: {
      port: process.env.PORT || 3000,
      environment: process.env.NODE_ENV || "production",
    },
  });
});

// Unified user creation endpoint - works with all database types
app.post("/api/users", async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({
      error: "name and email are required",
    });
  }

  try {
    // Check if database is SQL-based or document-based
    if (["mongodb", "cosmosdb"].includes(db.dbType.toLowerCase())) {
      // MongoDB/Cosmos DB operation
      const result = await db.documentQuery("insertone", "users", {
        name,
        email,
        created_at: new Date(),
      });

      return res.status(201).json({
        _id: result.insertedId,
        name,
        email,
        created_at: new Date(),
      });
    } else {
      // SQL-based operation
      let result;

      if (db.dbType.toLowerCase() === "mysql") {
        // MySQL uses ? placeholders
        result = await db.query(
          "INSERT INTO users (name, email) VALUES (?, ?)",
          [name, email]
        );
        const created = await db.query(
          "SELECT id, name, email, created_at FROM users WHERE id = ?",
          [result.insertId]
        );
        return res.status(201).json(created.rows[0]);
      } else if (["mssql", "sqlserver", "azure-sql"].includes(db.dbType.toLowerCase())) {
        // Azure SQL uses @param format
        result = await db.query(
          "INSERT INTO users (name, email) OUTPUT INSERTED.id, INSERTED.name, INSERTED.email, INSERTED.created_at VALUES (@param0, @param1)",
          [name, email]
        );
        return res.status(201).json(result.rows[0]);
      } else {
        // PostgreSQL uses $1, $2 format
        result = await db.query(
          "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email, created_at",
          [name, email]
        );
        return res.status(201).json(result.rows[0]);
      }
    }
  } catch (error) {
    if (error.code === "23505" || error.code === "ER_DUP_ENTRY" || error.message.includes("duplicate")) {
      return res.status(409).json({ error: "email already exists" });
    }

    console.error("Create user error:", error);
    return res.status(500).json({ error: "failed to create user" });
  }
});

// Unified list users endpoint - works with all database types
app.get("/api/users", async (req, res) => {
  try {
    if (["mongodb", "cosmosdb"].includes(db.dbType.toLowerCase())) {
      // MongoDB/Cosmos DB operation
      const result = await db.documentQuery("find", "users", {});
      return res.status(200).json(result);
    } else {
      // SQL-based operation
      const result = await db.query(
        "SELECT id, name, email, created_at FROM users ORDER BY id"
      );

      return res.status(200).json(result.rows);
    }
  } catch (error) {
    console.error("List users error:", error);
    return res.status(500).json({ error: "failed to fetch users" });
  }
});

// Unified get user by ID endpoint
app.get("/api/users/:id", async (req, res) => {
  try {
    if (["mongodb", "cosmosdb"].includes(db.dbType.toLowerCase())) {
      // MongoDB/Cosmos DB operation - convert string ID to ObjectId
      const { ObjectId } = require("mongodb");
      const query = ObjectId.isValid(req.params.id) ? { _id: new ObjectId(req.params.id) } : { _id: req.params.id };
      
      const result = await db.documentQuery("findone", "users", query);
      
      if (!result) {
        return res.status(404).json({ error: "user not found" });
      }

      return res.status(200).json(result);
    } else {
      // SQL-based operation
      let result;
      if (db.dbType.toLowerCase() === "mysql") {
        result = await db.query(
          "SELECT id, name, email, created_at FROM users WHERE id = ?",
          [req.params.id]
        );
      } else if (["mssql", "sqlserver", "azure-sql"].includes(db.dbType.toLowerCase())) {
        result = await db.query(
          "SELECT id, name, email, created_at FROM users WHERE id = @param0",
          [req.params.id]
        );
      } else {
        result = await db.query(
          "SELECT id, name, email, created_at FROM users WHERE id = $1",
          [req.params.id]
        );
      }

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "user not found" });
      }

      return res.status(200).json(result.rows[0]);
    }
  } catch (error) {
    console.error("Get user error:", error);
    return res.status(500).json({ error: "failed to fetch user" });
  }
});

// Unified update user endpoint
app.put("/api/users/:id", async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({
      error: "name and email are required",
    });
  }

  try {
    if (["mongodb", "cosmosdb"].includes(db.dbType.toLowerCase())) {
      // MongoDB/Cosmos DB operation
      const { ObjectId } = require("mongodb");
      const query = ObjectId.isValid(req.params.id) ? { _id: new ObjectId(req.params.id) } : { _id: req.params.id };
      
      const result = await db.documentQuery("updateone", "users", query, {
        name,
        email,
        updated_at: new Date(),
      });

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: "user not found" });
      }

      const updated = await db.documentQuery("findone", "users", query);
      return res.status(200).json(updated);
    } else {
      // SQL-based operation
      let result;
      if (db.dbType.toLowerCase() === "mysql") {
        result = await db.query(
          "UPDATE users SET name = ?, email = ? WHERE id = ?",
          [name, email, req.params.id]
        );
        if (result.rowCount === 0) {
          return res.status(404).json({ error: "user not found" });
        }
        const updated = await db.query(
          "SELECT id, name, email, created_at FROM users WHERE id = ?",
          [req.params.id]
        );
        return res.status(200).json(updated.rows[0]);
      } else if (["mssql", "sqlserver", "azure-sql"].includes(db.dbType.toLowerCase())) {
        result = await db.query(
          "UPDATE users SET name = @param0, email = @param1 OUTPUT INSERTED.id, INSERTED.name, INSERTED.email, INSERTED.created_at WHERE id = @param2",
          [name, email, req.params.id]
        );
      } else {
        result = await db.query(
          "UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING id, name, email, created_at",
          [name, email, req.params.id]
        );
      }

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "user not found" });
      }

      return res.status(200).json(result.rows[0]);
    }
  } catch (error) {
    if (error.code === "23505" || error.code === "ER_DUP_ENTRY" || error.message.includes("duplicate")) {
      return res.status(409).json({ error: "email already exists" });
    }

    console.error("Update user error:", error);
    return res.status(500).json({ error: "failed to update user" });
  }
});

// Unified delete user endpoint
app.delete("/api/users/:id", async (req, res) => {
  try {
    if (["mongodb", "cosmosdb"].includes(db.dbType.toLowerCase())) {
      // MongoDB/Cosmos DB operation
      const { ObjectId } = require("mongodb");
      const query = ObjectId.isValid(req.params.id) ? { _id: new ObjectId(req.params.id) } : { _id: req.params.id };
      
      const result = await db.documentQuery("deleteone", "users", query);

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: "user not found" });
      }

      return res.status(200).json({ message: "user deleted" });
    } else {
      // SQL-based operation
      let result;
      if (db.dbType.toLowerCase() === "mysql") {
        result = await db.query("DELETE FROM users WHERE id = ?", [req.params.id]);
      } else if (["mssql", "sqlserver", "azure-sql"].includes(db.dbType.toLowerCase())) {
        result = await db.query("DELETE FROM users WHERE id = @param0", [req.params.id]);
      } else {
        result = await db.query("DELETE FROM users WHERE id = $1", [req.params.id]);
      }

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "user not found" });
      }

      return res.status(200).json({ message: "user deleted" });
    }
  } catch (error) {
    console.error("Delete user error:", error);
    return res.status(500).json({ error: "failed to delete user" });
  }
});

async function startServer() {
  try {
    await db.initializeSchema();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✓ API running at http://0.0.0.0:${PORT}`);
      console.log(`✓ Database type: ${db.dbType}`);
      console.log(`✓ Endpoints:`);
      console.log(`  GET  /health                - Health check`);
      console.log(`  GET  /api/message           - Test message`);
      console.log(`  POST /api/echo              - Echo request body`);
      console.log(`  GET  /api/users             - List all users`);
      console.log(`  POST /api/users             - Create user`);
      console.log(`  GET  /api/users/:id         - Get user by ID`);
      console.log(`  PUT  /api/users/:id         - Update user`);
      console.log(`  DELETE /api/users/:id       - Delete user`);
    });
  } catch (error) {
    console.error("✗ Failed to start server:", error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  await db.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully...");
  await db.close();
  process.exit(0);
});

startServer();
