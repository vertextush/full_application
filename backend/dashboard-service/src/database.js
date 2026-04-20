/**
 * Multi-Cloud Database Abstraction Layer
 * Supports: Azure SQL, SQL Server, Azure Cosmos DB, MongoDB, PostgreSQL, MySQL
 * Configuration via DATABASE_URL connection string or individual parameters
 */

const { Pool } = require("pg");
const mysql = require("mysql2/promise");
const { MongoClient } = require("mongodb");
const sql = require("mssql");
const { CosmosClient } = require("@azure/cosmos");

class Database {
  constructor() {
    this.connection = null;
    this.pool = null;
    this.client = null;
    this.dbType = "postgres";
    this.db = null;
    this.collection = null;
    this.isInitialized = false;
  }

  /**
   * Initialize database connection based on DATABASE_URL or individual parameters
   */
  async initialize() {
    if (this.isInitialized) return;

    const databaseUrl = process.env.DATABASE_URL;
    const dbType = process.env.DB_TYPE || (databaseUrl ? this.detectDBType(databaseUrl) : "postgres");
    this.dbType = dbType;

    try {
      switch (dbType.toLowerCase()) {
        case "postgres":
        case "postgresql":
          await this.initializePostgreSQL(databaseUrl);
          break;

        case "mysql":
          await this.initializeMySQL(databaseUrl);
          break;

        case "mssql":
        case "sqlserver":
        case "azure-sql":
          await this.initializeAzureSQL(databaseUrl);
          break;

        case "mongodb":
        case "cosmosdb":
          await this.initializeCosmosDB(databaseUrl);
          break;

        default:
          console.log("[DB] Unknown database type, defaulting to PostgreSQL");
          await this.initializePostgreSQL(databaseUrl);
      }

      this.isInitialized = true;
      console.log(`[DB] ✓ Successfully initialized ${this.dbType} connection`);
    } catch (error) {
      console.error(`[DB] Failed to initialize database: ${error.message}`);
      throw error;
    }
  }

  /**
   * Detect database type from connection string
   */
  detectDBType(connectionString) {
    if (!connectionString) return "postgres";

    const urlStr = connectionString.toLowerCase();
    if (urlStr.startsWith("postgres://") || urlStr.startsWith("postgresql://")) return "postgres";
    if (urlStr.startsWith("mysql://")) return "mysql";
    if (urlStr.startsWith("mongodb://") || urlStr.startsWith("mongodb+srv://")) {
      return urlStr.includes("cosmos") ? "cosmosdb" : "mongodb";
    }
    if (urlStr.startsWith("mssql://") || urlStr.includes("sqlserver") || urlStr.includes(".database.windows.net")) {
      return "azure-sql";
    }

    return "postgres";
  }

  /**
   * Initialize PostgreSQL connection
   */
  async initializePostgreSQL(databaseUrl) {
    let config;

    if (databaseUrl) {
      console.log("[DB] Connecting to PostgreSQL via DATABASE_URL");
      config = { connectionString: databaseUrl };
    } else {
      console.log("[DB] Connecting to PostgreSQL via individual parameters");
      config = {
        host: process.env.DB_HOST || process.env.POSTGRES_HOST || "localhost",
        port: Number(process.env.DB_PORT || process.env.POSTGRES_PORT) || 5432,
        user: process.env.DB_USER || process.env.POSTGRES_USER || "postgres",
        password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || "",
        database: process.env.DB_NAME || process.env.POSTGRES_DB || "myapp_db",
      };
    }

    this.pool = new Pool(config);
    this.pool.on("error", (err) => {
      console.error("[DB Pool Error]", err);
    });

    // Test connection
    try {
      const result = await this.pool.query("SELECT 1");
      console.log("[DB] PostgreSQL connection verified");
    } catch (error) {
      throw new Error(`PostgreSQL connection failed: ${error.message}`);
    }
  }

  /**
   * Initialize MySQL connection
   */
  async initializeMySQL(databaseUrl) {
    let config;

    if (databaseUrl) {
      console.log("[DB] Connecting to MySQL via DATABASE_URL");
      // Parse MySQL URL: mysql://user:password@host:port/database
      const url = new URL(databaseUrl);
      config = {
        host: url.hostname,
        port: url.port || 3306,
        user: url.username,
        password: url.password,
        database: url.pathname.substring(1),
      };
    } else {
      console.log("[DB] Connecting to MySQL via individual parameters");
      config = {
        host: process.env.DB_HOST || process.env.MYSQL_HOST || "localhost",
        port: Number(process.env.DB_PORT || process.env.MYSQL_PORT) || 3306,
        user: process.env.DB_USER || process.env.MYSQL_USER || "root",
        password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || "",
        database: process.env.DB_NAME || process.env.MYSQL_DB || "myapp_db",
      };
    }

    this.pool = mysql.createPool(config);

    // Test connection
    try {
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      console.log("[DB] MySQL connection verified");
    } catch (error) {
      throw new Error(`MySQL connection failed: ${error.message}`);
    }
  }

  /**
   * Initialize Azure SQL Server connection (MSSQL)
   */
  async initializeAzureSQL(databaseUrl) {
    let config;

    if (databaseUrl) {
      console.log("[DB] Connecting to Azure SQL via DATABASE_URL");
      // Parse Azure SQL URL format: mssql://user:password@server.database.windows.net:1433/database
      // Or standard format: Server=tcp:server.database.windows.net,1433;Initial Catalog=database;User ID=user;Password=password;
      
      if (databaseUrl.startsWith("mssql://")) {
        const url = new URL(databaseUrl);
        config = {
          server: url.hostname,
          port: url.port || 1433,
          authentication: {
            type: "default",
            options: {
              userName: url.username,
              password: url.password,
            },
          },
          options: {
            database: url.pathname.substring(1),
            encrypt: true,
            trustServerCertificate: false,
            connectTimeout: 15000,
          },
        };
      } else {
        // Parse connection string format
        config = this.parseAzureSQLConnectionString(databaseUrl);
      }
    } else {
      console.log("[DB] Connecting to Azure SQL via individual parameters");
      config = {
        server: process.env.DB_HOST || process.env.AZURE_SQL_SERVER || "localhost",
        port: Number(process.env.DB_PORT) || 1433,
        authentication: {
          type: "default",
          options: {
            userName: process.env.DB_USER || process.env.AZURE_SQL_USER || "sa",
            password: process.env.DB_PASSWORD || process.env.AZURE_SQL_PASSWORD || "",
          },
        },
        options: {
          database: process.env.DB_NAME || process.env.AZURE_SQL_DB || "myapp_db",
          encrypt: true,
          trustServerCertificate: false,
          connectTimeout: 15000,
        },
      };
    }

    try {
      await sql.connect(config);
      this.connection = sql.defaultPool;
      console.log("[DB] Azure SQL connection verified");
    } catch (error) {
      throw new Error(`Azure SQL connection failed: ${error.message}`);
    }
  }

  /**
   * Parse Azure SQL connection string
   */
  parseAzureSQLConnectionString(connStr) {
    const config = {
      authentication: { type: "default", options: {} },
      options: { encrypt: true, trustServerCertificate: false, connectTimeout: 15000 },
    };

    const parts = connStr.split(";");
    for (const part of parts) {
      const [key, value] = part.split("=");
      if (!key || !value) continue;

      const k = key.trim().toLowerCase();
      const v = value.trim();

      if (k === "server" || k === "data source") {
        config.server = v.replace("tcp:", "");
      } else if (k === "initial catalog" || k === "database") {
        config.options.database = v;
      } else if (k === "user id" || k === "uid") {
        config.authentication.options.userName = v;
      } else if (k === "password" || k === "pwd") {
        config.authentication.options.password = v;
      }
    }

    return config;
  }

  /**
   * Initialize Azure Cosmos DB (MongoDB API) or MongoDB
   */
  async initializeCosmosDB(databaseUrl) {
    try {
      let mongoUrl = databaseUrl;

      if (!mongoUrl) {
        // Use environment variables for Cosmos DB
        const cosmosUser = process.env.COSMOS_USER || process.env.DB_USER;
        const cosmosPassword = process.env.COSMOS_PASSWORD || process.env.DB_PASSWORD;
        const cosmosHost = process.env.COSMOS_HOST || process.env.DB_HOST;

        if (!cosmosHost) {
          throw new Error("COSMOS_HOST or DATABASE_URL required for Cosmos DB");
        }

        if (cosmosPassword) {
          mongoUrl = `mongodb+srv://${cosmosUser}:${encodeURIComponent(cosmosPassword)}@${cosmosHost}/?retryWrites=true&w=majority`;
        } else {
          mongoUrl = `mongodb+srv://${cosmosHost}/?retryWrites=true&w=majority`;
        }
      }

      // Handle Cosmos DB specific URL format
      if (mongoUrl.includes("cosmos.azure.com")) {
        console.log("[DB] Connecting to Azure Cosmos DB");
      } else {
        console.log("[DB] Connecting to MongoDB");
      }

      const clientOptions = {
        maxPoolSize: 10,
        minPoolSize: 2,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 10000,
      };

      this.client = new MongoClient(mongoUrl, clientOptions);
      await this.client.connect();

      const dbName = process.env.MONGO_DB || process.env.DB_NAME || "myapp_db";
      this.db = this.client.db(dbName);
      this.collection = this.db.collection("users");

      // Verify connection
      await this.client.db("admin").command({ ping: 1 });
      console.log("[DB] MongoDB/Cosmos DB connection verified");
    } catch (error) {
      throw new Error(`MongoDB/Cosmos DB connection failed: ${error.message}`);
    }
  }

  /**
   * Execute a SQL query (PostgreSQL, MySQL, Azure SQL)
   */
  async query(sql, params = []) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      switch (this.dbType.toLowerCase()) {
        case "postgres":
        case "postgresql":
          return await this.pool.query(sql, params);

        case "mysql":
          const [mysqlResult] = await this.pool.execute(sql, params);
          if (Array.isArray(mysqlResult)) {
            return { rows: mysqlResult, rowCount: mysqlResult.length };
          }

          return {
            rows: [],
            rowCount: mysqlResult.affectedRows || 0,
            insertId: mysqlResult.insertId,
          };

        case "mssql":
        case "sqlserver":
        case "azure-sql":
          const request = this.connection.request();
          params.forEach((param, index) => {
            request.input(`param${index}`, param);
          });
          const result = await request.query(sql);
          return {
            rows: result.recordset || [],
            rowCount: Array.isArray(result.rowsAffected)
              ? (result.rowsAffected[0] || 0)
              : (result.rowCount || 0),
          };

        case "mongodb":
        case "cosmosdb":
          throw new Error("Use documentQuery() for MongoDB/Cosmos DB operations");

        default:
          throw new Error(`Unsupported database type: ${this.dbType}`);
      }
    } catch (error) {
      console.error("[DB Query Error]", error.message);
      throw error;
    }
  }

  /**
   * Execute a MongoDB/Cosmos DB document operation
   */
  async documentQuery(operation, collection, query = {}, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!["mongodb", "cosmosdb"].includes(this.dbType.toLowerCase())) {
      throw new Error(`documentQuery() only works with MongoDB/Cosmos DB, current: ${this.dbType}`);
    }

    try {
      const col = this.db.collection(collection || "users");

      switch (operation.toLowerCase()) {
        case "find":
          return await col.find(query).toArray();

        case "findone":
          return await col.findOne(query);

        case "insert":
        case "insertone":
          return await col.insertOne(query);

        case "insertmany":
          return await col.insertMany(query);

        case "update":
        case "updateone":
          return await col.updateOne(query, { $set: options });

        case "delete":
        case "deleteone":
          return await col.deleteOne(query);

        case "deletemany":
          return await col.deleteMany(query);

        case "count":
          return await col.countDocuments(query);

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      console.error("[DB Document Query Error]", error.message);
      throw error;
    }
  }

  /**
   * Check database connectivity
   */
  async checkConnection() {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      switch (this.dbType.toLowerCase()) {
        case "postgres":
        case "postgresql":
          await this.pool.query("SELECT 1");
          break;

        case "mysql":
          const connection = await this.pool.getConnection();
          await connection.ping();
          connection.release();
          break;

        case "mssql":
        case "sqlserver":
        case "azure-sql":
          await this.connection.request().query("SELECT 1");
          break;

        case "mongodb":
        case "cosmosdb":
          await this.client.db("admin").command({ ping: 1 });
          break;
      }

      return { connected: true, type: this.dbType };
    } catch (error) {
      console.error("[DB Connection Check Failed]", error.message);
      return { connected: false, type: this.dbType, error: error.message };
    }
  }

  /**
   * Initialize database schema
   */
  async initializeSchema() {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      switch (this.dbType.toLowerCase()) {
        case "postgres":
        case "postgresql":
          await this.pool.query(`
            CREATE TABLE IF NOT EXISTS users (
              id SERIAL PRIMARY KEY,
              name TEXT NOT NULL,
              email TEXT UNIQUE NOT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `);
          break;

        case "mysql":
          await this.pool.execute(`
            CREATE TABLE IF NOT EXISTS users (
              id INT AUTO_INCREMENT PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              email VARCHAR(255) UNIQUE NOT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `);
          break;

        case "mssql":
        case "sqlserver":
        case "azure-sql":
          await this.connection.request().query(`
            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = N'users')
            BEGIN
              CREATE TABLE users (
                id INT IDENTITY(1,1) PRIMARY KEY,
                name NVARCHAR(255) NOT NULL,
                email NVARCHAR(255) UNIQUE NOT NULL,
                created_at DATETIME DEFAULT GETDATE()
              )
            END
          `);
          break;

        case "mongodb":
        case "cosmosdb":
          // MongoDB doesn't require schema creation, but we can create index
          await this.db.collection("users").createIndex({ email: 1 }, { unique: true });
          break;
      }

      console.log("[DB] Schema initialized successfully");
      return true;
    } catch (error) {
      console.error("[DB Schema Initialization Error]", error.message);
      throw error;
    }
  }

  /**
   * Close all database connections
   */
  async close() {
    try {
      switch (this.dbType.toLowerCase()) {
        case "postgres":
        case "postgresql":
          if (this.pool) await this.pool.end();
          break;

        case "mysql":
          if (this.pool) await this.pool.end();
          break;

        case "mssql":
        case "sqlserver":
        case "azure-sql":
          if (this.connection) await this.connection.close();
          break;

        case "mongodb":
        case "cosmosdb":
          if (this.client) await this.client.close();
          break;
      }

      this.isInitialized = false;
      console.log("[DB] Connection closed");
    } catch (error) {
      console.error("[DB Close Error]", error.message);
    }
  }
}

// Create and export singleton instance
const db = new Database();

module.exports = db;
