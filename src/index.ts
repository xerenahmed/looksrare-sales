import {
  ApolloClient,
  InMemoryCache,
  gql,
  HttpLink,
} from "@apollo/client/core";
import fetch from "cross-fetch";
import { BigNumber, utils } from "ethers";
import * as fs from "fs";

const endpoint = "https://api.looksrare.org/graphql";
const collectionAddress = "0x8c186802b1992f7650ac865d4ca94d55ff3c0d17";

const client = new ApolloClient({
  cache: new InMemoryCache(),
  link: new HttpLink({ uri: endpoint, fetch }),
});

const GET_LAST_ACTIVITY = gql`
  query GetEventsQuery(
    $pagination: PaginationInput
    $filter: EventFilterInput
  ) {
    events(pagination: $pagination, filter: $filter) {
      ...EventFragment
    }
  }
  fragment UserEventFragment on User {
    address
    name
    isVerified
    avatar {
      image
    }
  }

  fragment EventFragment on Event {
    id
    from {
      ...UserEventFragment
    }
    to {
      ...UserEventFragment
    }
    type
    hash
    createdAt
    token {
      tokenId
      image
      name
    }
    collection {
      address
      name
      description
      totalSupply
      logo
      floorOrder {
        price
      }
    }
    order {
      isOrderAsk
      price
      endTime
      currency
      strategy
      status
      params
    }
  }
`;

async function handleData(data: any, ethPrice: number) {
  const from = data.from.address;
  const to = data.to.address;
  const createdAt = data.createdAt;
  const { name, image } = data.token;
  const floorPrice = data.collection.floorOrder.price;
  const price = data.order.price;
  const floorPriceFormatted = utils.formatEther(
    BigNumber.from(data.collection.floorOrder.price)
  );
  const priceFormatted = utils.formatEther(BigNumber.from(data.order.price));
  const tx = `https://etherscan.io/tx/${data.hash}`;
  const looksRareURL = `https://looksrare.org/collections/0x8C186802b1992f7650Ac865d4CA94D55fF3C0d17/${data.token.tokenId}`;

  let extra = "";
  let diff = ((price - floorPrice) / price) * 100;
  if (diff < 0) {
    extra = "(below %" + parseFloat(Math.abs(diff).toFixed(2)) + ")";
  } else if (diff > 0) {
    extra = "(above %" + parseFloat(Math.abs(diff).toFixed(2)) + ")";
  }

  const message = `${name} sold for ${priceFormatted} ETH (${parseFloat(
    (parseFloat(floorPriceFormatted) * ethPrice).toFixed(2)
  )} USD) ${extra}\nExplore on ${looksRareURL}`;
  console.log(message);
  console.log("-----");
}

async function main() {
  let lastID = 0;
  if (fs.existsSync("./lastID.txt")) {
    lastID = parseInt(fs.readFileSync("./lastID.txt", "utf8"));
  }

  const {
    ethereum: { usd: ethPrice },
  } = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
  ).then((res) => res.json());
  const { data: response } = await client.query({
    query: GET_LAST_ACTIVITY,
    variables: {
      filter: {
        collection: collectionAddress,
        type: "SALE",
      },
      pagination: {
        first: 20, // last 20 sales
      },
    },
    fetchPolicy: "no-cache",
  });
  for (let i = response.events.length - 1; i >= 0; i--) {
    const data = response.events[i];

    if (parseInt(data.id) > lastID) {
      lastID = parseInt(data.id);

      await handleData(data, ethPrice);
    }
  }
  // save lasID to file
  fs.writeFileSync("./lastID.txt", String(lastID));
}

main();
