require("dotenv").config()
const express = require("express")
const slowDown = require("express-slow-down")
const helmet = require("helmet")
const morgan = require("morgan")
const {MongoClient} = require('mongodb');

const client = new MongoClient(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })

client.connect()

async function run() {
	// await client.connect();
	// await client.db("admin").command({ ping: 1 });
	// console.log("Connected successfully to server");
	client.db("broker").collection("stocks").findOne({"symbol":"NVDA"}, (err, res) =>{
		if(err) throw err;
		console.log(res.name);
	})
}
// run().catch(console.dir);

const app = express();
const port = 8080


app.use(express.json())
app.use(helmet())
app.use(morgan("tiny"))

app.get("/", function(req, res){
	res.json({"status":"success"})
});

app.get("/stock", function(req, res){
	client.db("broker").collection("stocks").find({}).toArray( (err, result) =>{
		result = JSON.parse(JSON.stringify(result))
		res.set('content-type', 'application/json');
		res.jsonp(result)
	});
});

app.get("/stock/:symbol", function(req, res){
	let sym = req.params.symbol.toUpperCase()
	client.db("broker").collection("stocks").findOne({"symbol":sym}, (err, result) =>{
		result = JSON.parse(JSON.stringify(result))
		res.set('content-type', 'application/json');
		res.jsonp(result)
	});
});

app.use(function (req, res, next) {
	res.status(404).send("Not found")
})

app.listen(port, () => {
	console.log(`App running in port ${port}`)
})
