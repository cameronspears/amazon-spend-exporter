export const AMAZON_COM_ORDERS_URL =
  "https://www.amazon.com/gp/your-account/order-history?opt=ab&digitalOrders=0";

export const AMAZON_COM_SELECTORS = {
  auth: {
    signInInputs: ["#ap_email", "#ap_password", "form[name='signIn']"],
    checkpointMarkers: [
      "input[name='cvf_captcha_input']",
      "form[action*='validateCaptcha']",
      "img[alt*='captcha' i]"
    ]
  },
  ordersList: {
    pageReady: ["text=Your Orders", "#ordersContainer", "#ordersContainer div[data-order-id]"],
    orderCards: [
      "div.order-card",
      "div[data-order-id]",
      "div.js-order-card"
    ],
    detailLinkContains: [
      "order-details",
      "your-account/order-details",
      "gp/css/order-details",
      "orderid=",
      "orderid%3d"
    ],
    nextPageLinks: [
      "li.a-last a",
      "a[aria-label*='Next' i]",
      "a.s-pagination-next",
      "a:has-text('Next')"
    ]
  },
  orderDetail: {
    status: [
      ".order-info .a-color-success",
      "div.order-status",
      "span[data-test-id='order-status-label']",
      "span:has-text('Delivered')",
      "span:has-text('Shipped')",
      "span:has-text('Arriving')"
    ],
    paymentMethod: [
      "div.payment-instrument",
      "span.pmts-payment-method",
      "div:has-text('ending in')"
    ],
    shippingAddress: [
      "div.displayAddressDiv",
      "div.a-box.shippingAddressBlock",
      "div:has-text('Shipping Address')"
    ],
    itemContainers: [
      "div.order-item",
      "div.a-fixed-left-grid-inner",
      "div.shipment .a-box-group",
      "div.item-view-left-col-inner"
    ],
    itemTitle: ["a.product-title", "span.a-truncate-cut", "a[href*='/dp/']", "h4"],
    itemQuantity: ["span.quantity", "span:has-text('Qty')", "span:has-text('Quantity')"],
    itemPrice: [
      "span.item-price",
      "span.a-size-medium.a-color-price",
      "span:has-text('Item price')"
    ],
    itemSubtotal: ["span.item-subtotal", "span:has-text('Subtotal')"],
    invoiceLinks: ["a[href*='invoice']", "a[href*='print']"]
  }
};
