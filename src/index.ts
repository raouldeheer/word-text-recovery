import AdmZip from "adm-zip";
import fetch from "node-fetch";
import format from "xml-formatter";
import express from "express";
import fileUpload from "express-fileupload";
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import ip from "ip";
import { Json } from "mylas";
import { join } from "path";

const expressPort = 4271;
const { version } = Json.loadS<{ version: string; }>(join(__dirname, "../package.json"));

async function recover(buf: Buffer) {
    try {
        const document = new AdmZip(buf)
            .getEntries()
            .find(e => e.entryName === "word/document.xml");

        const text = document?.getData().toString("utf-8");
        if (!text) return "File not found";

        const response = await fetch("https://www.cleancss.com/api.php", {
            method: "POST",
            body: new URLSearchParams([
                ["function", "strip-xml"],
                ["string", format(text, {
                    indentation: "\t"
                })]
            ])
        });

        const data = await response.json() as { string: string, status: string; };
        if (data.status !== "OK") return "Dantools not ok";

        return data.string.replace(/\t/g, "").replace(/\r\n\r\n/g, "");
    } catch (e) {
        console.log(`Something went wrong. ${e}`);
        return "Something went wrong";
    }
}

express()
    .use(rateLimit({
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 200
    }))
    .use(helmet())
    .use(morgan('common'))
    .use(cors())
    .use(fileUpload({
        abortOnLimit: true,
        limits: {
            fileSize: 50 * 1024 * 1024,
        },
    }))
    .get("/version", (req, res) => {
        res.send(version);
    })
    .get("/status", (req, res) => {
        res.sendStatus(200);
    })
    .post("/",
        (req, res) => {
            if (!req.files || Object.keys(req.files).length === 0) {
                return res.status(400).send("No files were uploaded.");
            }

            const wordFile = req.files.wordfile;
            if (!wordFile || Array.isArray(wordFile)) {
                res.sendStatus(400);
                return;
            }

            recover(wordFile.data).then(e => {
                res.send(e);
            }).catch(e => {
                console.error(e);
                res.sendStatus(500);
            });
        }
    )
    .listen(expressPort, ip.address(), () => {
        console.log(`Listing on http://${ip.address()}:${expressPort}/`);
    });
