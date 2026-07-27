export interface MenuLibraryItem {
  id: string;
  name: string;
  category: string;
  image: any;
}

export const MENU_LIBRARY: MenuLibraryItem[] = [
  {
    id: "tea",
    name: "Tea",
    category: "Beverages",
    image: require("../assets/menu/tea.png"),
  },
  {
    id: "samosa",
    name: "Samosa",
    category: "Snacks",
    image: require("../assets/menu/samosa.png"),
  },
  {
    id: "paratha",
    name: "Paratha",
    category: "Snacks",
    image: require("../assets/menu/paratha.png"),
  },
  {
    id: "idli",
    name: "Idli",
    category: "South Indian",
    image: require("../assets/menu/idli.png"),
  },
  {
    id: "dosa",
    name: "Dosa",
    category: "South Indian",
    image: require("../assets/menu/dosa.png"),
  },
  {
    id: "poha",
    name: "Poha",
    category: "Breakfast",
    image: require("../assets/menu/poha.png"),
  },
  {
    id: "water",
    name: "Water Bottle",
    category: "Beverages",
    image: require("../assets/menu/waterbottle.png"),
  },
  {
    id: "omelette",
    name: "Bread Omelette",
    category: "Breakfast",
    image: require("../assets/menu/breadomelette.png"),
  },
];

