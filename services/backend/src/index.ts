import express from "express";

const app = express();

app.get("/projects", (req, res) => {
  const projects = [
    { title: "Create backend", completed: true },
    { title: "Connect gateway", completed: false },
    { title: "Build dashboard", completed: false },
  ];
  return res.json({ projects });
});
app.listen(4000, () => {
  console.log("Sever started to listen");
});
