package com.chat.ChatApp.service;

import com.chat.ChatApp.model.Users;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

@Service
public class UserService {

    @Autowired
    private JWTService jwtService;

    @Autowired
    AuthenticationManager authManager;

    public String verify (Users user) {
        try {
            Authentication authentication = authManager.authenticate(
                    new UsernamePasswordAuthenticationToken(
                            user.getUsername(),
                            user.getPassword()
                    )
            );

            if(authentication.isAuthenticated()) {
                return jwtService.generateToken(user.getUsername());
            } else {
                return "fail";
            }

        } catch (Exception e) {
            return "fail"; // or throw custom exception
        }
    }

    }


