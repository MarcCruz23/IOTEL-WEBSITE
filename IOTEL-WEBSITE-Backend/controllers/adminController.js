const db = require("../config/firebase");

async function getDashboard(req, res) {
    const [products, orders, payments, bookings, activities] = await Promise.all([
        db.collection("products").get(), db.collection("orders").get(), db.collection("payments").get(), db.collection("bookings").get(), db.collection("activityLogs").get()
    ]);
    const productList = products.docs.map((doc) => doc.data()).filter((product) => product.status !== "inactive");
    const orderList = orders.docs.map((doc) => doc.data());
    const paymentList = payments.docs.map((doc) => doc.data());
    const recentActivities = activities.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).slice(0, 10);
    return res.json({ success: true, dashboard: {
        totalProducts: productList.length,
        lowStockProducts: productList.filter((product) => product.stock <= (product.lowStockThreshold ?? 5)),
        totalOrders: orderList.length,
        pendingOrders: orderList.filter((order) => order.orderStatus === "pending_payment").length,
        completedOrders: orderList.filter((order) => order.orderStatus === "delivered").length,
        pendingPayments: paymentList.filter((payment) => payment.status === "submitted").length,
        approvedPayments: paymentList.filter((payment) => payment.status === "approved").length,
        totalBookings: bookings.size,
        recentActivities
    } });
}

module.exports = { getDashboard };
