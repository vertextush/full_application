const express = require("express");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// CORS Middleware
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// Health check endpoint - User Service
app.get("/health", async (req, res) => {
  const dbStatus = await db.checkConnection();

  res.status(200).json({
    status: "ok",
    service: "user-service",
    database: dbStatus.connected ? "connected" : "disconnected",
    databaseType: dbStatus.type,
    time: new Date().toISOString(),
  });
});

// Generic endpoints
app.get("/api/message", (req, res) => {
  res.status(200).json({
    message: "Hello from User Service",
    connected: true,
  });
});

app.post("/api/echo", (req, res) => {
  res.status(200).json({
    youSent: req.body,
  });
});

// ============ User Management Endpoints ============

// Create user
app.post("/api/users", async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({
      error: "name and email are required",
    });
  }

  try {
    if (["mongodb", "cosmosdb"].includes(db.dbType.toLowerCase())) {
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
      let result;

      if (db.dbType.toLowerCase() === "mysql") {
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
        result = await db.query(
          "INSERT INTO users (name, email) OUTPUT INSERTED.id, INSERTED.name, INSERTED.email, INSERTED.created_at VALUES (@param0, @param1)",
          [name, email]
        );
        return res.status(201).json(result.rows[0]);
      } else {
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

// List all users
app.get("/api/users", async (req, res) => {
  try {
    if (["mongodb", "cosmosdb"].includes(db.dbType.toLowerCase())) {
      const result = await db.documentQuery("find", "users", {});
      return res.status(200).json(result);
    } else {
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

// Get user by ID
app.get("/api/users/:id", async (req, res) => {
  try {
    if (["mongodb", "cosmosdb"].includes(db.dbType.toLowerCase())) {
      const { ObjectId } = require("mongodb");
      const query = ObjectId.isValid(req.params.id) ? { _id: new ObjectId(req.params.id) } : { _id: req.params.id };
      
      const result = await db.documentQuery("findone", "users", query);
      
      if (!result) {
        return res.status(404).json({ error: "user not found" });
      }

      return res.status(200).json(result);
    } else {
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

// Update user
app.put("/api/users/:id", async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({
      error: "name and email are required",
    });
  }

  try {
    if (["mongodb", "cosmosdb"].includes(db.dbType.toLowerCase())) {
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

// Delete user
app.delete("/api/users/:id", async (req, res) => {
  try {
    if (["mongodb", "cosmosdb"].includes(db.dbType.toLowerCase())) {
      const { ObjectId } = require("mongodb");
      const query = ObjectId.isValid(req.params.id) ? { _id: new ObjectId(req.params.id) } : { _id: req.params.id };
      
      const result = await db.documentQuery("deleteone", "users", query);

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: "user not found" });
      }

      return res.status(200).json({ message: "user deleted" });
    } else {
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
      console.log(`✓ User Service running at http://0.0.0.0:${PORT}`);
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
