import React, { createContext, useContext, useState } from "react";
import { useRouter } from "expo-router";
import { apiUrl } from "@/lib/backend";

type CartItem = {
  master_product_id: string;
  item_name: string;
  unit: string;
  quantity: number;
  price: number;
};

type CartContextType = {
  cart: CartItem[];
  selectedVendor: any;
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  setSelectedVendor: (vendor: any) => void;
  reassignToAlternativeVendor: (newVendor: any) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<any>(null);
  const router = useRouter();

  const clearCart = () => {
    setCart([]);
    setSelectedVendor(null);
  };

  // Preserves cart items while re-linking to a new vendor in the same locality
  const reassignToAlternativeVendor = (newVendor: any) => {
    setSelectedVendor(newVendor);
    router.push({
      pathname: "/hyperlocal/cart" as any,
      params: {
        vendor: newVendor.id,
        terminal: newVendor.terminal_id,
        shopName: newVendor.shop_name,
        reassigned: "true",
      },
    });
  };

  return (
    <CartContext.Provider
      value={{ cart, selectedVendor, setCart, setSelectedVendor, reassignToAlternativeVendor, clearCart }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}