import * as dotenv from "dotenv";
dotenv.config();
import bcrypt from "bcrypt";
import express from "express";
import slowDown from "express-slow-down";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import { MongoClient } from "mongodb";
import jwt from "jsonwebtoken";
if (!process.env.MONGODB_URI) {
    throw new Error("No MongoDB URI was set");
}
if (!process.env.JWT_SECRET) {
    throw new Error("No JWT secret was set");
}
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
console.log("Connected to MongoDB");
const speedLimiter = slowDown({
    // 1000 requests every 15 minutes
    windowMs: 15 * 60 * 1000,
    delayAfter: 1000,
    delayMs: 500,
});
const app = express();
const port = process.env.PORT || 8080;
const saltRounds = 10;
app.use(express.json());
app.use(helmet());
app.use(morgan("tiny"));
app.use(cors());
app.use(speedLimiter);
function generateToken(username) {
    if (!username) {
        throw new Error("No username was provided");
    }
    return jwt.sign(username, process.env.JWT_SECRET, {
        expiresIn: 3600,
    });
}
app.post("/login", (req, res) => {
    client
        .db("broker")
        .collection("users")
        .findOne({ username: req.body.username }, (err, result) => {
        if (err)
            throw err;
        if (result) {
            bcrypt.compare(req.body.password, result.password, (err, same) => {
                if (err)
                    throw err;
                if (same) {
                    res.send({
                        status: "success",
                        token: generateToken({ username: req.body.username }),
                    });
                }
                else {
                    res.send({
                        status: "error",
                        token: "",
                    });
                }
            });
        }
        else {
            res.send({
                status: "error",
                token: "",
            });
        }
    });
});
app.post("/register", (req, res) => {
    client
        .db("broker")
        .collection("users")
        .findOne({ username: req.body.username }, (err, result) => {
        if (result) {
            res.json({
                status: "error",
                message: "Username already exists in database",
            });
            return;
        }
        bcrypt.hash(req.body.password, saltRounds, function (err, hash) {
            client
                .db("broker")
                .collection("users")
                .insertOne({ username: req.body.username, password: hash });
            client
                .db("broker")
                .collection("wallets")
                .insertOne({ username: req.body.username, eur: "10000" });
        });
        res.json({ status: "success" });
    });
});
function authenticateToken(req, res, next) {
    const token = req.body.token;
    if (token == null)
        return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.log(err);
            return res.sendStatus(401);
        }
        if (user) {
            req.user = user;
        }
        next();
    });
}
app.use("/buy/:id", authenticateToken);
app.post("/buy/:id", (req, res) => {
    const add = {};
    var amountExisted;
    let stockExisted;
    let enoughMoney;
    let oldAmount;
    var money = 0;
    const symbol = req.params.id.toUpperCase();
    client
        .db("broker")
        .collection("wallets")
        .findOne({ username: req.body.username }, (err, result) => {
        if (err)
            throw err;
        for (let key in result) {
            if (key === symbol) {
                amountExisted = true;
                oldAmount = (parseFloat(result[key]) + parseFloat(req.body.amount)).toString();
            }
        }
        client
            .db("broker")
            .collection("stocks")
            .findOne({ symbol: symbol }, (err, stockResult) => {
            if (!result) {
                stockExisted = false;
            }
            else {
                stockExisted = true;
            }
            if ((stockResult === null || stockResult === void 0 ? void 0 : stockResult.hDailies[0].close) * req.body.amount <= (result === null || result === void 0 ? void 0 : result.eur)) {
                enoughMoney = true;
                money = (stockResult === null || stockResult === void 0 ? void 0 : stockResult.hDailies[0].close) * req.body.amount;
            }
            if (!amountExisted) {
                oldAmount = req.body.amount;
            }
            if (stockExisted && enoughMoney) {
                //Update database
                add[symbol] = oldAmount;
                let newMoney = (result === null || result === void 0 ? void 0 : result.eur) - money;
                let changeMoney = {};
                changeMoney["eur"] = newMoney;
                client
                    .db("broker")
                    .collection("wallets")
                    .updateOne({ username: req.user.username }, { $set: changeMoney }, (err) => {
                    if (err)
                        throw err;
                    client
                        .db("broker")
                        .collection("wallets")
                        .updateOne({ username: req.user.username }, { $set: add }, (err) => {
                        if (err)
                            throw err;
                        return res.json({
                            status: "success",
                            message: "Stock bought",
                        });
                    });
                });
            }
            else {
                if (!stockExisted) {
                    return res.json({
                        status: "error",
                        message: "Stock not found",
                    });
                }
                else if (!enoughMoney) {
                    return res.json({
                        status: "error",
                        message: "Not enough money for the operation",
                    });
                }
                else {
                    return res.json({
                        status: "error",
                        message: "Unidentified error",
                    });
                }
            }
        });
    });
});
app.use("/sell/:id", authenticateToken);
app.post("/sell/:id", (req, res) => {
    const add = {};
    let amountExisted;
    let stockExisted;
    let oldAmount;
    let money = 0;
    const symbol = req.params.id.toUpperCase();
    client
        .db("broker")
        .collection("wallets")
        .findOne({ username: req.user.username }, (err, result) => {
        if (err)
            throw err;
        for (let key in result) {
            if (key === symbol) {
                amountExisted = true;
                oldAmount = parseFloat(result[key]) - parseFloat(req.body.amount);
                if (oldAmount < 0) {
                    return res.json({
                        status: "error",
                        message: "Can't sell more stocks than you own",
                    });
                }
            }
        }
        if (!amountExisted) {
            return res.json({
                status: "error",
                message: "Stock not found",
            });
        }
        client
            .db("broker")
            .collection("stocks")
            .findOne({ symbol: symbol }, (err, stockResult) => {
            if (!result) {
                stockExisted = false;
            }
            else {
                stockExisted = true;
            }
            money = (stockResult === null || stockResult === void 0 ? void 0 : stockResult.hDailies[0].close) * req.body.amount;
            if (!amountExisted) {
                oldAmount = req.body.amount;
            }
            if (stockExisted) {
                //Update database
                add[symbol] = oldAmount;
                let newMoney = (result === null || result === void 0 ? void 0 : result.eur) + money;
                let changeMoney = {};
                changeMoney["eur"] = newMoney;
                client
                    .db("broker")
                    .collection("wallets")
                    .updateOne({ username: req.user.username }, { $set: changeMoney }, (err) => {
                    if (err)
                        throw err;
                    client
                        .db("broker")
                        .collection("wallets")
                        .updateOne({ username: req.user.username }, { $set: add }, (err) => {
                        if (err)
                            throw err;
                        return res.json({
                            status: "success",
                            message: "Stock sold",
                        });
                    });
                });
            }
            else {
                if (!stockExisted) {
                    return res.json({
                        status: "error",
                        message: "Stock not found",
                    });
                }
                else {
                    return res.json({
                        status: "error",
                        message: "Unidentified error",
                    });
                }
            }
        });
    });
});
app.use("/wallet", authenticateToken);
app.post("/wallet", function (req, res) {
    client
        .db("broker")
        .collection("wallets")
        .findOne({ username: req.user.username }, (err, result) => {
        // Neither username nor id should be displayed in wallet
        result === null || result === void 0 ? true : delete result.username;
        if ((result === null || result === void 0 ? void 0 : result.eur) && typeof result.eur === "number") {
            result.eur = result.eur.toFixed(2);
        }
        res.json(result);
    });
});
app.get("/", function (req, res) {
    res.json({
        status: "success",
        message: "Welcome to XTOX API! https://github.com/singiamtel/xtox-back",
    });
});
app.get("/stock", function (req, res) {
    client
        .db("broker")
        .collection("stocks")
        .find({})
        .toArray((err, result) => {
        if (err)
            throw err;
        res.json(result);
    });
});
app.get("/stock/:symbol", function (req, res) {
    let sym = req.params.symbol.toUpperCase();
    client
        .db("broker")
        .collection("stocks")
        .findOne({ symbol: sym }, (err, result) => {
        if (err)
            throw err;
        res.json(result);
    });
});
app.use(function (req, res, next) {
    res.status(404).send("Not found");
});
app.listen(port, () => {
    console.log(`App running in port ${port}`);
});
