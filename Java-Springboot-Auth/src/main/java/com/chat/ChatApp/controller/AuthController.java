package com.chat.ChatApp.controller;

import com.chat.ChatApp.service.JWTService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/auth")
public class AuthController {
    @Autowired
    private JWTService jwtService;

    @PostMapping("/verify")
    public ResponseEntity<?> verifyToken(@RequestBody Map<String, String> request) {
        String token = request.get("token");

        try {
            String username = jwtService.extractUserName(token);
            boolean valid = !jwtService.isTokenExpired(token);

            if (valid) {
                return ResponseEntity.ok(Map.of(
                        "valid", true,
                        "username", username
                ));
            } else {
                return ResponseEntity.status(401).body(Map.of("valid", false, "error", "Token expired"));
            }
        } catch (Exception e) {
            return ResponseEntity.status(401).body(Map.of("valid", false, "error", "Invalid token"));
        }
    }
}

