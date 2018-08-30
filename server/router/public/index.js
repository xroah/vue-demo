const router = require("express").Router();
const query = require("../../db/query");

router.get("/article/:page?/:keywords?", (req, res) => {
    let {
        params
    } = req;
    let page = params.page || 1;
    let keywords = params.keywords;
    let filter = {
        secret: "0"
    };
    if (keywords) {
        filter.content = new RegExp(keywords, "ig");
    }
    query.find("articles", filter, {
        pagination: page,
        sort: {
            createTime: -1
        },
        projection: {
            content: 0
        }
    }).then(ret => {
        res.json({
            errCode: 0,
            data: ret
        });
    });;
})

module.exports = router;